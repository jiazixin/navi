package catalog

import "slices"

// Catalog is the validated, grouped navigation directory without a store revision.
type Catalog struct {
	Pages []Page
}

// Page contains one ordered navigation page supplied by urls.yaml.
type Page struct {
	ID       string
	Title    string
	Subtitle string
	Groups   []Group
}

// Group preserves its first appearance order in urls.yaml.
type Group struct {
	Name  string
	Links []Link
}

// Link is a validated navigation destination. Empty URL fields are absent.
type Link struct {
	RuntimeID   string
	Name        string
	Description string
	PrivateURL  string
	PublicURL   string
	Tags        []string
}

// FindLink returns a copy of the link with the requested runtime ID.
func (c Catalog) FindLink(runtimeID string) (Link, bool) {
	for _, page := range c.Pages {
		for _, group := range page.Groups {
			for _, link := range group.Links {
				if link.RuntimeID == runtimeID {
					link.Tags = slices.Clone(link.Tags)
					return link, true
				}
			}
		}
	}
	return Link{}, false
}

func (c Catalog) clone() Catalog {
	cloned := Catalog{Pages: make([]Page, len(c.Pages))}
	for pageIndex, page := range c.Pages {
		cloned.Pages[pageIndex] = Page{
			ID: page.ID, Title: page.Title, Subtitle: page.Subtitle,
			Groups: make([]Group, len(page.Groups)),
		}
		for groupIndex, group := range page.Groups {
			cloned.Pages[pageIndex].Groups[groupIndex] = Group{
				Name: group.Name, Links: make([]Link, len(group.Links)),
			}
			for linkIndex, link := range group.Links {
				cloned.Pages[pageIndex].Groups[groupIndex].Links[linkIndex] = link
				cloned.Pages[pageIndex].Groups[groupIndex].Links[linkIndex].Tags = slices.Clone(link.Tags)
			}
		}
	}
	return cloned
}
