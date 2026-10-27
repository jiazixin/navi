package favicon

import (
	"net/url"
	"testing"
)

func FuzzDiscoverCandidates(f *testing.F) {
	f.Add([]byte(`<link rel="icon" href="/icon.png">`))
	f.Add([]byte(`<base href="https://other.test"><link rel="icon" href="https://user:secret@example.test/icon">`))
	f.Fuzz(func(t *testing.T, contents []byte) {
		if len(contents) > maxHTMLBytes {
			t.Skip()
		}
		base, err := url.Parse("https://example.test/path")
		if err != nil {
			t.Fatal(err)
		}
		for _, candidate := range parseCandidates(contents, base) {
			parsed, err := url.Parse(candidate.url)
			if err != nil || parsed.User != nil || len(candidate.url) > 4096 || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				t.Fatalf("invalid discovered candidate %q", candidate.url)
			}
		}
	})
}
