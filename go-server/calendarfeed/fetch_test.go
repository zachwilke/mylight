package calendarfeed

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestConditionalHTTPResponses(t *testing.T) {
	req, _ := http.NewRequest("GET", "https://calendar.example.test/feed", nil)
	applyValidators(req, Validators{ETag: `"v1"`, LastModified: "Fri, 04 Sep 2026 00:00:00 GMT"})
	if req.Header.Get("If-None-Match") != `"v1"` || req.Header.Get("If-Modified-Since") == "" {
		t.Fatal("missing conditional headers")
	}
	response := func(code int, body string) *http.Response {
		return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body)), Request: req, Header: http.Header{"Etag": {`"v2"`}, "Last-Modified": {"Sat, 05 Sep 2026 00:00:00 GMT"}}}
	}
	result, err := readFeedResponse(response(304, ""))
	if err != nil || !result.NotModified || len(result.Data) != 0 {
		t.Fatal(result, err)
	}
	result, err = readFeedResponse(response(200, "calendar bytes"))
	if err != nil || string(result.Data) != "calendar bytes" || result.Validators.ETag != `"v2"` {
		t.Fatal(result, err)
	}
	if _, err := readFeedResponse(response(200, strings.Repeat("x", MaxBytes+1))); err == nil {
		t.Fatal("oversized body accepted")
	}
	if _, err := readFeedResponse(response(503, "")); err == nil {
		t.Fatal("HTTP failure accepted")
	}
	req.Header = http.Header{}
	if _, err := readFeedResponse(response(304, "")); err == nil {
		t.Fatal("unsolicited 304 accepted")
	}
}

func TestUnsafeValidatorsAreNotSent(t *testing.T) {
	req, _ := http.NewRequest("GET", "https://calendar.example.test/feed", nil)
	applyValidators(req, Validators{ETag: "bad\r\nInjected: value", LastModified: strings.Repeat("a", 1025)})
	if len(req.Header) != 0 {
		t.Fatal("unsafe validators emitted", req.Header)
	}
}
