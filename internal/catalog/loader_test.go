package catalog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFilePreservesPageGroupAndLinkOrder(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, `version: 1
pages:
  - id: page1
    title: First Page
    urls:
      - {name: A1, group: A, public_url: "https://a1.test"}
      - {name: B1, group: B, public_url: "https://b1.test"}
      - {name: A2, group: A, public_url: "https://a2.test"}
  - id: page2
    title: Second Page
    urls: []
`)

	loaded, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile() error = %v", err)
	}
	if len(loaded.Pages) != 2 || loaded.Pages[0].ID != "page1" || loaded.Pages[1].ID != "page2" {
		t.Fatalf("pages = %#v", loaded.Pages)
	}
	groups := loaded.Pages[0].Groups
	if len(groups) != 2 || groups[0].Name != "A" || groups[1].Name != "B" {
		t.Fatalf("groups = %#v", groups)
	}
	if got := []string{groups[0].Links[0].Name, groups[0].Links[1].Name}; strings.Join(got, ",") != "A1,A2" {
		t.Fatalf("group A links = %v", got)
	}
}

func TestLoadFileAcceptsSingleDestinationVariants(t *testing.T) {
	t.Parallel()

	for name, urlField := range map[string]string{
		"private": "private_url: http://private.test",
		"public":  "public_url: https://public.test",
	} {
		t.Run(name, func(t *testing.T) {
			contents := "version: 1\npages:\n  - id: page1\n    title: Navi\n    urls:\n      - name: Single\n        group: One\n        " + urlField + "\n"
			loaded, err := LoadFile(writeCatalog(t, contents))
			if err != nil {
				t.Fatalf("LoadFile() error = %v", err)
			}
			if len(loaded.Pages[0].Groups[0].Links) != 1 {
				t.Fatalf("pages = %#v", loaded.Pages)
			}
		})
	}
}

func TestLoadFileRejectsInvalidCatalogsWithoutLeakingQuery(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		contents string
		want     string
	}{
		"legacy shape": {
			contents: "version: 1\nsite: {title: Navi}\nurls: []\n",
			want:     "field site not found",
		},
		"missing pages": {
			contents: "version: 1\n",
			want:     "pages: is required",
		},
		"duplicate page id": {
			contents: "version: 1\npages:\n  - {id: page1, title: One, urls: []}\n  - {id: page1, title: Two, urls: []}\n",
			want:     "pages[1].id: must be unique",
		},
		"invalid page id": {
			contents: "version: 1\npages:\n  - {id: Page_1, title: One, urls: []}\n",
			want:     "pages[0].id",
		},
		"missing address": {
			contents: "version: 1\npages:\n  - id: page1\n    title: Navi\n    urls:\n      - {name: Missing, group: One}\n",
			want:     "private_url or public_url",
		},
		"unsupported scheme": {
			contents: "version: 1\npages:\n  - id: page1\n    title: Navi\n    urls:\n      - {name: FTP, group: One, public_url: 'ftp://example.test/?secret=value'}\n",
			want:     "http or https",
		},
		"duplicate within page": {
			contents: "version: 1\npages:\n  - id: page1\n    title: Navi\n    urls:\n      - &entry {name: Same, group: One, public_url: https://example.test}\n      - *entry\n",
			want:     "duplicate",
		},
		"unknown field": {
			contents: "version: 1\npages:\n  - {id: page1, title: Navi, urls: [], unknown: true}\n",
			want:     "field unknown not found",
		},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := LoadFile(writeCatalog(t, test.contents))
			if err == nil {
				t.Fatal("LoadFile() error = nil, want validation error")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %q, want %q", err, test.want)
			}
			if strings.Contains(err.Error(), "secret=value") {
				t.Fatalf("error leaks query string: %q", err)
			}
		})
	}
}

func TestRuntimeIDIncludesPageIdentity(t *testing.T) {
	t.Parallel()

	loaded, err := LoadFile(writeCatalog(t, `version: 1
pages:
  - id: page1
    title: One
    urls:
      - {name: Shared, group: Group, public_url: https://example.test}
  - id: page2
    title: Two
    urls:
      - {name: Shared, group: Group, public_url: https://example.test}
`))
	if err != nil {
		t.Fatal(err)
	}
	firstID := loaded.Pages[0].Groups[0].Links[0].RuntimeID
	secondID := loaded.Pages[1].Groups[0].Links[0].RuntimeID
	if firstID == "" || secondID == "" || firstID == secondID {
		t.Fatalf("runtime IDs = %q, %q", firstID, secondID)
	}
}

func TestLoadFileRejectsFilesOverTwoMiB(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "urls.yaml")
	contents := "version: 1\npages:\n  - {id: page1, title: Navi, urls: []}\n" + strings.Repeat("# padding\n", maxCatalogBytes/9+1)
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := LoadFile(path)
	if err == nil || !strings.Contains(err.Error(), "2 MiB") {
		t.Fatalf("LoadFile() error = %v, want size error", err)
	}
}

func writeCatalog(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "urls.yaml")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
