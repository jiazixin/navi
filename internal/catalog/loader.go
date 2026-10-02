package catalog

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

const maxCatalogBytes = 2 * 1024 * 1024

const (
	maxPages      = 20
	maxTotalLinks = 1_000
)

var pageIDPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

type sourceCatalog struct {
	Version int           `yaml:"version"`
	Pages   *[]sourcePage `yaml:"pages"`
}

type sourcePage struct {
	ID       string        `yaml:"id"`
	Title    string        `yaml:"title"`
	Subtitle *string       `yaml:"subtitle"`
	URLs     *[]sourceLink `yaml:"urls"`
}

type sourceLink struct {
	Name        string   `yaml:"name"`
	Group       string   `yaml:"group"`
	Description *string  `yaml:"description"`
	PrivateURL  string   `yaml:"private_url"`
	PublicURL   string   `yaml:"public_url"`
	Tags        []string `yaml:"tags"`
}

// LoadFile reads, validates, and groups a urls.yaml file.
func LoadFile(path string) (Catalog, error) {
	file, err := os.Open(path)
	if err != nil {
		return Catalog{}, fmt.Errorf("open catalog: %w", err)
	}
	defer file.Close()

	contents, err := io.ReadAll(io.LimitReader(file, maxCatalogBytes+1))
	if err != nil {
		return Catalog{}, fmt.Errorf("read catalog: %w", err)
	}
	if len(contents) > maxCatalogBytes {
		return Catalog{}, fmt.Errorf("read catalog: file exceeds 2 MiB")
	}

	var source sourceCatalog
	decoder := yaml.NewDecoder(strings.NewReader(string(contents)))
	decoder.KnownFields(true)
	if err := decoder.Decode(&source); err != nil {
		return Catalog{}, fmt.Errorf("decode catalog: %w", err)
	}
	var trailing yaml.Node
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err != nil {
			return Catalog{}, fmt.Errorf("decode catalog: %w", err)
		}
		return Catalog{}, fmt.Errorf("decode catalog: multiple YAML documents are not supported")
	}

	return validateAndBuild(source)
}

func validateAndBuild(source sourceCatalog) (Catalog, error) {
	if source.Version != 1 {
		return Catalog{}, fieldError("version", "must equal 1")
	}
	if source.Pages == nil {
		return Catalog{}, fieldError("pages", "is required")
	}
	if len(*source.Pages) < 1 || len(*source.Pages) > maxPages {
		return Catalog{}, fieldError("pages", fmt.Sprintf("must contain 1 to %d pages", maxPages))
	}

	pages := make([]Page, len(*source.Pages))
	pageIDs := make(map[string]struct{}, len(*source.Pages))
	totalLinks := 0
	for pageIndex, rawPage := range *source.Pages {
		page, err := validatePage(rawPage, pageIndex)
		if err != nil {
			return Catalog{}, err
		}
		if _, exists := pageIDs[page.ID]; exists {
			return Catalog{}, fieldError(fmt.Sprintf("pages[%d].id", pageIndex), "must be unique")
		}
		pageIDs[page.ID] = struct{}{}
		totalLinks += countPageLinks(page)
		if totalLinks > maxTotalLinks {
			return Catalog{}, fieldError("pages", fmt.Sprintf("must contain at most %d links in total", maxTotalLinks))
		}
		pages[pageIndex] = page
	}

	return Catalog{Pages: pages}, nil
}

func validatePage(raw sourcePage, pageIndex int) (Page, error) {
	prefix := fmt.Sprintf("pages[%d]", pageIndex)
	id := strings.TrimSpace(raw.ID)
	if !pageIDPattern.MatchString(id) {
		return Page{}, fieldError(prefix+".id", "must start with a lowercase letter and contain only lowercase letters, digits, or hyphens")
	}
	title := strings.TrimSpace(raw.Title)
	if err := validateLength(prefix+".title", title, 1, 40); err != nil {
		return Page{}, err
	}
	if raw.URLs == nil {
		return Page{}, fieldError(prefix+".urls", "is required")
	}

	page := Page{ID: id, Title: title}
	if raw.Subtitle != nil {
		subtitle := strings.TrimSpace(*raw.Subtitle)
		if err := validateLength(prefix+".subtitle", subtitle, 0, 100); err != nil {
			return Page{}, err
		}
		page.Subtitle = subtitle
	}

	groupIndexes := make(map[string]int)
	seen := make(map[string]struct{})
	for linkIndex, rawLink := range *raw.URLs {
		link, groupName, err := validateLink(rawLink, pageIndex, linkIndex, id)
		if err != nil {
			return Page{}, err
		}
		duplicateKey := strings.Join([]string{groupName, link.Name, link.PrivateURL, link.PublicURL}, "\x00")
		if _, exists := seen[duplicateKey]; exists {
			return Page{}, fieldError(fmt.Sprintf("%s.urls[%d]", prefix, linkIndex), "duplicates an existing link on this page")
		}
		seen[duplicateKey] = struct{}{}

		groupIndex, exists := groupIndexes[groupName]
		if !exists {
			groupIndex = len(page.Groups)
			groupIndexes[groupName] = groupIndex
			page.Groups = append(page.Groups, Group{Name: groupName})
		}
		page.Groups[groupIndex].Links = append(page.Groups[groupIndex].Links, link)
	}
	return page, nil
}

func validateLink(raw sourceLink, pageIndex, linkIndex int, pageID string) (Link, string, error) {
	prefix := fmt.Sprintf("pages[%d].urls[%d]", pageIndex, linkIndex)
	name := strings.TrimSpace(raw.Name)
	if err := validateLength(prefix+".name", name, 1, 60); err != nil {
		return Link{}, "", err
	}
	groupName := strings.TrimSpace(raw.Group)
	if err := validateLength(prefix+".group", groupName, 1, 40); err != nil {
		return Link{}, "", err
	}

	privateURL, err := normalizeURL(raw.PrivateURL)
	if err != nil {
		return Link{}, "", fieldError(prefix+".private_url", err.Error())
	}
	publicURL, err := normalizeURL(raw.PublicURL)
	if err != nil {
		return Link{}, "", fieldError(prefix+".public_url", err.Error())
	}
	if privateURL == "" && publicURL == "" {
		return Link{}, "", fieldError(prefix, "must include private_url or public_url")
	}

	link := Link{Name: name, PrivateURL: privateURL, PublicURL: publicURL}
	if raw.Description != nil {
		description := strings.TrimSpace(*raw.Description)
		if err := validateLength(prefix+".description", description, 0, 120); err != nil {
			return Link{}, "", err
		}
		link.Description = description
	}
	if len(raw.Tags) > 10 {
		return Link{}, "", fieldError(prefix+".tags", "must contain at most 10 items")
	}
	link.Tags = make([]string, len(raw.Tags))
	for tagIndex, tag := range raw.Tags {
		trimmed := strings.TrimSpace(tag)
		if err := validateLength(fmt.Sprintf("%s.tags[%d]", prefix, tagIndex), trimmed, 1, 24); err != nil {
			return Link{}, "", err
		}
		link.Tags[tagIndex] = trimmed
	}
	link.RuntimeID = runtimeID(pageID, groupName, link)
	return link, groupName, nil
}

func countPageLinks(page Page) int {
	total := 0
	for _, group := range page.Groups {
		total += len(group.Links)
	}
	return total
}

func validateLength(path, value string, minimum, maximum int) error {
	length := utf8.RuneCountInString(value)
	if length < minimum || length > maximum {
		return fieldError(path, fmt.Sprintf("must contain %d to %d characters", minimum, maximum))
	}
	return nil
}

func normalizeURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	// Catalog destinations are complete URLs, including optional fragments.
	// ParseRequestURI treats a fragment as path data and breaks anchor links.
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		return "", fmt.Errorf("must be a valid URL")
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	parsed.Host = strings.ToLower(parsed.Host)
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("must use http or https")
	}
	if rawPort := parsed.Port(); rawPort != "" {
		port, err := strconv.Atoi(rawPort)
		if err != nil || port < 1 || port > 65_535 {
			return "", fmt.Errorf("must use a port between 1 and 65535")
		}
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	return parsed.String(), nil
}

func runtimeID(pageID, groupName string, link Link) string {
	key := strings.Join([]string{pageID, groupName, link.Name, link.PrivateURL, link.PublicURL}, "\x00")
	digest := sha256.Sum256([]byte(key))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

type validationError struct {
	path    string
	message string
}

func (e validationError) Error() string {
	return fmt.Sprintf("%s: %s", e.path, e.message)
}

func fieldError(path, message string) error {
	return validationError{path: path, message: message}
}
