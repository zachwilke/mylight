package main

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
)

// Production builds copy Vite output into web/dist before compilation.
// The placeholder keeps plain go test/go run usable without a frontend build.
//
//go:embed web
var webAssets embed.FS

func frontendHandler() http.Handler {
	var assets fs.FS
	if dir := os.Getenv("DIST_DIR"); dir != "" {
		assets = os.DirFS(dir)
	} else if embedded, err := fs.Sub(webAssets, "web/dist"); err == nil {
		if _, err := fs.Stat(embedded, "index.html"); err == nil {
			assets = embedded
		}
	}
	if assets == nil {
		for _, dir := range []string{"dist", "../dist"} {
			candidate := os.DirFS(dir)
			if _, err := fs.Stat(candidate, "index.html"); err == nil {
				assets = candidate
				break
			}
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		if assets == nil {
			http.Error(w, "Frontend not built. Run npm run build or use a release binary.", 503)
			return
		}
		name := path.Clean("/" + r.URL.Path)[1:]
		if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
			http.FileServer(http.FS(assets)).ServeHTTP(w, r)
			return
		}
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
		// Clone the request so SPA fallback cannot alter authentication routing.
		clone := r.Clone(r.Context())
		clone.URL.Path = "/"
		w.Header().Set("Cache-Control", "no-cache")
		http.FileServer(http.FS(assets)).ServeHTTP(w, clone)
	})
}
