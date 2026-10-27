package catalog

import "testing"

func FuzzDecodeCatalog(f *testing.F) {
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 65536 {
			return
		}
		result, err := decodeCatalog(data)
		if err != nil {
			return
		}
		if len(result.Pages) < 1 || len(result.Pages) > maxPages {
			t.Fatalf("accepted invalid page count: %d", len(result.Pages))
		}
		seen := make(map[string]bool)
		total := 0
		for _, page := range result.Pages {
			if seen[page.ID] {
				t.Fatal("accepted duplicate page ID")
			}
			seen[page.ID] = true
			for _, group := range page.Groups {
				for _, link := range group.Links {
					total++
					if link.RuntimeID == "" || (link.PrivateURL == "" && link.PublicURL == "") {
						t.Fatal("accepted incomplete link")
					}
				}
			}
		}
		if total > maxTotalLinks {
			t.Fatal("accepted too many links")
		}
	})
}
