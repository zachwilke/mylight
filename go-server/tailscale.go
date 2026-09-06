package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"tailscale.com/ipn/ipnstate"
	"tailscale.com/tsnet"
)

type tailnetConfig struct {
	Enabled  bool
	Only     bool
	Hostname string
	StateDir string
	AuthKey  string
}

func tailnetConfigFromEnv(dataDir string) (tailnetConfig, error) {
	var cfg tailnetConfig
	var err error
	if cfg.Enabled, err = strconv.ParseBool(getEnv("MYLIGHT_TAILSCALE", "false")); err != nil {
		return cfg, fmt.Errorf("MYLIGHT_TAILSCALE must be true or false")
	}
	if cfg.Only, err = strconv.ParseBool(getEnv("MYLIGHT_TAILSCALE_ONLY", "false")); err != nil {
		return cfg, fmt.Errorf("MYLIGHT_TAILSCALE_ONLY must be true or false")
	}
	if cfg.Only && !cfg.Enabled {
		return cfg, fmt.Errorf("tailnet-only access requires MYLIGHT_TAILSCALE=true")
	}
	if !cfg.Enabled {
		return cfg, nil
	}
	cfg.Hostname = getEnv("MYLIGHT_TAILSCALE_HOSTNAME", "mylight")
	if !regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`).MatchString(cfg.Hostname) {
		return cfg, fmt.Errorf("MYLIGHT_TAILSCALE_HOSTNAME must be a lowercase DNS label")
	}
	absData, err := filepath.Abs(dataDir)
	if err != nil {
		return cfg, err
	}
	// Node identity lives outside household backups/restores, never inside uploads.
	cfg.StateDir, err = filepath.Abs(getEnv("MYLIGHT_TAILSCALE_STATE_DIR", absData+"-tailscale"))
	if err != nil {
		return cfg, err
	}
	rel, err := filepath.Rel(absData, cfg.StateDir)
	if err != nil || rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))) {
		return cfg, fmt.Errorf("Tailscale state must be outside DATA_DIR")
	}
	cfg.AuthKey = strings.TrimSpace(os.Getenv("TS_AUTHKEY"))
	if keyFile := os.Getenv("MYLIGHT_TAILSCALE_AUTH_KEY_FILE"); keyFile != "" {
		if cfg.AuthKey != "" {
			return cfg, fmt.Errorf("use TS_AUTHKEY or MYLIGHT_TAILSCALE_AUTH_KEY_FILE, not both")
		}
		f, err := os.Open(keyFile)
		if err != nil {
			return cfg, fmt.Errorf("could not open Tailscale auth key file")
		}
		defer f.Close()
		data, err := io.ReadAll(io.LimitReader(f, 4097))
		if err != nil || len(data) > 4096 {
			return cfg, fmt.Errorf("invalid Tailscale auth key file")
		}
		cfg.AuthKey = strings.TrimSpace(string(data))
		if cfg.AuthKey == "" {
			return cfg, fmt.Errorf("Tailscale auth key file is empty")
		}
	}
	return cfg, nil
}

type remoteAccess struct {
	config   tailnetConfig
	node     *tsnet.Server
	listener net.Listener
	status   func(context.Context) (*ipnstate.Status, error)
}

func startRemoteAccess(cfg tailnetConfig) (*remoteAccess, error) {
	remote := &remoteAccess{config: cfg}
	if !cfg.Enabled {
		return remote, nil
	}
	if err := os.MkdirAll(cfg.StateDir, 0700); err != nil {
		return nil, fmt.Errorf("could not create Tailscale state directory")
	}
	node := &tsnet.Server{Dir: cfg.StateDir, Hostname: cfg.Hostname, AuthKey: cfg.AuthKey,
		ControlURL: "https://controlplane.tailscale.com",
		// Enrollment links are available only to the signed-in owner in Settings.
		UserLogf: func(string, ...any) {}, Logf: func(string, ...any) {}}
	client, err := node.LocalClient()
	if err != nil {
		node.Close()
		return nil, fmt.Errorf("could not start embedded Tailscale; check state-directory permissions")
	}
	listener, err := node.Listen("tcp", ":443")
	if err != nil {
		node.Close()
		return nil, fmt.Errorf("could not create the private Tailscale listener")
	}
	remote.node = node
	remote.status = client.StatusWithoutPeers
	// Only tailnet connections can reach this listener. Certificate negotiation
	// remains unavailable until MagicDNS and HTTPS are enabled by the tailnet admin.
	remote.listener = tls.NewListener(listener, &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: client.GetCertificate})
	remote.config.AuthKey = ""
	return remote, nil
}

func (remote *remoteAccess) Close() {
	if remote != nil && remote.node != nil {
		remote.node.Close()
	}
}

type remoteStatus struct {
	Enabled     bool   `json:"enabled"`
	TailnetOnly bool   `json:"tailnet_only"`
	State       string `json:"state"`
	URL         string `json:"url,omitempty"`
	AuthURL     string `json:"auth_url,omitempty"`
	Message     string `json:"message"`
}

func (remote *remoteAccess) snapshot(ctx context.Context) remoteStatus {
	result := remoteStatus{State: "disabled", Message: "Enable embedded Tailscale in your server configuration to connect privately from anywhere."}
	if remote == nil || !remote.config.Enabled {
		return result
	}
	result.Enabled, result.TailnetOnly = true, remote.config.Only
	result.State, result.Message = "connecting", "Waiting for Tailscale. Your local MyLight server is still available."
	if remote.status == nil {
		return result
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	status, err := remote.status(ctx)
	if err != nil || status == nil {
		return result
	}
	if status.BackendState == "NeedsLogin" {
		result.State, result.Message = "needs_login", "Authorize this MyLight device in your tailnet."
		if u, err := url.Parse(status.AuthURL); err == nil && u.Scheme == "https" && u.Host == "login.tailscale.com" && u.User == nil {
			result.AuthURL = u.String()
		}
		if result.AuthURL == "" {
			result.Message = "Waiting for an authorization link. If this persists, check your auth key or restart without one to use browser authorization."
		}
	} else if status.BackendState == "NeedsMachineAuth" {
		result.State, result.Message = "needs_approval", "Approve this device in the Tailscale admin console."
	} else if status.BackendState == "Running" {
		result.State, result.Message = "needs_https", "Enable MagicDNS and HTTPS certificates in the Tailscale admin console."
		if status.CurrentTailnet != nil && status.CurrentTailnet.MagicDNSEnabled && len(status.CertDomains) > 0 {
			host := strings.TrimSuffix(status.CertDomains[0], ".")
			if regexp.MustCompile(`^[a-z0-9-]+\.[a-z0-9.-]+\.ts\.net$`).MatchString(host) {
				result.State, result.URL = "ready", "https://"+host
				result.Message = "Private HTTPS is configured. Tailnet access rules and MyLight sign-in both apply."
			}
		}
	}
	return result
}

func (app *App) handleRemoteAccess(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Method not allowed", 405)
		return
	}
	jsonResponse(w, app.Remote.snapshot(r.Context()))
}

func privateAccessHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Tailnet membership is not household ownership. Bootstrap only locally,
		// even when an operator enables Tailscale before creating their owner.
		if r.URL.Path == "/api/setup" && r.Method != http.MethodGet && r.Method != http.MethodHead {
			jsonError(w, "Complete first-run household setup using the local server address", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
