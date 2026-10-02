package favicon

import (
	"bytes"
	"cmp"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

const maxHTMLBytes = 256 * 1024

type candidate struct {
	url   string
	score int
}

// Discover finds a likely favicon URL from an existing site URL.
func Discover(ctx context.Context, client *http.Client, pageURL string) ([]string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create favicon discovery request: %w", err)
	}
	if request.URL.Host == "" || (request.URL.Scheme != "http" && request.URL.Scheme != "https") {
		return nil, fmt.Errorf("invalid favicon discovery URL")
	}
	fallback := func(base *url.URL) ([]string, error) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		origin := &url.URL{Scheme: base.Scheme, Host: base.Host, Path: "/favicon.ico"}
		return []string{origin.String()}, nil
	}
	request.Header.Set("Accept", "text/html,application/xhtml+xml")
	response, err := client.Do(request)
	if err != nil {
		return fallback(request.URL)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fallback(response.Request.URL)
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, maxHTMLBytes+1))
	if err != nil {
		return fallback(response.Request.URL)
	}
	if len(contents) > maxHTMLBytes {
		return fallback(response.Request.URL)
	}
	base := response.Request.URL
	candidates := parseCandidates(contents, base)
	origin := &url.URL{Scheme: base.Scheme, Host: base.Host, Path: "/favicon.ico"}
	candidates = append(candidates, candidate{url: origin.String(), score: -1})
	urls := make([]string, 0, len(candidates))
	seen := make(map[string]struct{})
	for _, candidate := range candidates {
		if _, ok := seen[candidate.url]; ok {
			continue
		}
		seen[candidate.url] = struct{}{}
		urls = append(urls, candidate.url)
	}
	return urls, nil
}

func parseCandidates(contents []byte, base *url.URL) []candidate {
	document, err := html.Parse(bytes.NewReader(contents))
	if err != nil {
		return nil
	}
	var candidates []candidate
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && strings.EqualFold(node.Data, "link") {
			attributes := attributeMap(node)
			if isIconRelation(attributes["rel"]) {
				if resolved, ok := resolveCandidate(base, attributes["href"]); ok {
					candidates = append(candidates, candidate{url: resolved, score: scoreSizes(attributes["sizes"])})
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(document)
	slices.SortStableFunc(candidates, func(left, right candidate) int {
		return cmp.Compare(right.score, left.score)
	})
	return candidates
}

func attributeMap(node *html.Node) map[string]string {
	attributes := make(map[string]string, len(node.Attr))
	for _, attribute := range node.Attr {
		attributes[strings.ToLower(attribute.Key)] = attribute.Val
	}
	return attributes
}

func isIconRelation(value string) bool {
	for token := range strings.FieldsSeq(strings.ToLower(value)) {
		if token == "icon" || token == "shortcut" || token == "apple-touch-icon" {
			return true
		}
	}
	return strings.Contains(strings.ToLower(value), "apple-touch-icon")
}

func resolveCandidate(base *url.URL, raw string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", false
	}
	resolved := base.ResolveReference(parsed)
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return "", false
	}
	return resolved.String(), true
}

func scoreSizes(value string) int {
	best := -1
	for token := range strings.FieldsSeq(strings.ToLower(value)) {
		if token == "any" {
			return 64
		}
		widthText, heightText, found := strings.Cut(token, "x")
		if !found {
			continue
		}
		width, widthErr := strconv.Atoi(widthText)
		height, heightErr := strconv.Atoi(heightText)
		if widthErr != nil || heightErr != nil || width != height {
			continue
		}
		score := 64 - abs(64-width)
		if score > best {
			best = score
		}
	}
	return best
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
