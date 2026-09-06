package calendarfeed

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// NormalizeURL allows credential-bearing feed paths, but never basic-auth or LAN URLs.
func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "webcal://") {
		raw = "https://" + strings.TrimPrefix(raw, "webcal://")
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" || (u.Port() != "" && u.Port() != "443") || len(raw) > 4096 {
		return "", fmt.Errorf("use an HTTPS iCalendar URL without a username, password, fragment, or custom port")
	}
	if ip, err := netip.ParseAddr(u.Hostname()); err == nil && !PublicIP(ip) {
		return "", fmt.Errorf("private-network calendar URLs are not allowed")
	}
	return u.String(), nil
}

func PublicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
		return false
	}
	for _, cidr := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/32", "2002::/16", "64:ff9b::/96", "64:ff9b:1::/48"} {
		if netip.MustParsePrefix(cidr).Contains(ip) {
			return false
		}
	}
	return true
}

type Validators struct{ ETag, LastModified string }
type FetchResult struct {
	Data        []byte
	Validators  Validators
	NotModified bool
}

func Fetch(ctx context.Context, raw string) ([]byte, error) {
	result, err := FetchConditional(ctx, raw, Validators{})
	return result.Data, err
}
func FetchConditional(ctx context.Context, raw string, validators Validators) (FetchResult, error) {
	address, err := NormalizeURL(raw)
	if err != nil {
		return FetchResult{}, err
	}
	transport := &http.Transport{
		Proxy: nil, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 8 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("calendar host could not be resolved")
			}
			for _, ip := range ips {
				if !PublicIP(ip) {
					return nil, fmt.Errorf("calendar host resolves to a private or reserved address")
				}
			}
			// Dial the validated IP, not the hostname: DNS cannot change between check and connect.
			var dialErr error
			for i, ip := range ips {
				if i >= 8 {
					break
				}
				connection, err := (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if err == nil {
					return connection, nil
				}
				dialErr = err
				if ctx.Err() != nil {
					break
				}
			}
			return nil, dialErr
		},
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return fmt.Errorf("too many redirects")
		}
		// Validators belong to one representation and may themselves be sensitive.
		req.Header.Del("If-None-Match")
		req.Header.Del("If-Modified-Since")
		_, err := NormalizeURL(req.URL.String())
		return err
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return FetchResult{}, err
	}
	applyValidators(req, validators)
	req.Header.Set("Accept", "text/calendar")
	req.Header.Set("User-Agent", "MyLight/1 calendar subscription")
	response, err := client.Do(req)
	if err != nil {
		return FetchResult{}, fmt.Errorf("could not fetch calendar; check its URL and server connectivity")
	}
	return readFeedResponse(response)
}

func readFeedResponse(response *http.Response) (FetchResult, error) {
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotModified {
		if response.Request.Header.Get("If-None-Match") == "" && response.Request.Header.Get("If-Modified-Since") == "" {
			return FetchResult{}, fmt.Errorf("calendar returned not-modified without a matching cached request")
		}
		return FetchResult{NotModified: true}, nil
	}
	if response.StatusCode != 200 {
		return FetchResult{}, fmt.Errorf("calendar server returned HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, MaxBytes+1))
	if err != nil {
		return FetchResult{}, fmt.Errorf("calendar download interrupted")
	}
	if len(data) > MaxBytes {
		return FetchResult{}, fmt.Errorf("feed exceeds 2 MiB")
	}
	return FetchResult{Data: data, Validators: Validators{ETag: safeValidator(response.Header.Get("ETag")), LastModified: safeValidator(response.Header.Get("Last-Modified"))}}, nil
}
func safeValidator(value string) string {
	if len(value) > 1024 || strings.ContainsAny(value, "\r\n") {
		return ""
	}
	return value
}
func applyValidators(req *http.Request, v Validators) {
	if tag := safeValidator(v.ETag); tag != "" {
		req.Header.Set("If-None-Match", tag)
	}
	if modified := safeValidator(v.LastModified); modified != "" {
		req.Header.Set("If-Modified-Since", modified)
	}
}
