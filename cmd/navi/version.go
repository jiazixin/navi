package main

import (
	"fmt"
	"runtime/debug"
	"strings"
)

const shortRevisionLength = 7

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

type buildInformation struct {
	version   string
	commit    string
	buildTime string
}

func currentBuildInformation() buildInformation {
	information := defaultBuildInformation()
	goBuild, ok := debug.ReadBuildInfo()
	if !ok {
		return information
	}
	return resolveBuildInformation(information, goBuild)
}

func defaultBuildInformation() buildInformation {
	return buildInformation{
		version:   version,
		commit:    commit,
		buildTime: buildTime,
	}
}

func resolveBuildInformation(information buildInformation, goBuild *debug.BuildInfo) buildInformation {
	if goBuild == nil {
		return information
	}

	revision := pseudoVersionRevision(goBuild.Main.Version)
	if information.version == "dev" && goBuild.Main.Version != "" && goBuild.Main.Version != "(devel)" && revision == "" {
		information.version = goBuild.Main.Version
	}

	for _, setting := range goBuild.Settings {
		if setting.Key == "vcs.revision" && setting.Value != "" {
			revision = shortRevision(setting.Value)
		}
	}

	if information.commit == "unknown" && revision != "" {
		information.commit = revision
	}
	if information.version == "dev" && revision != "" {
		information.version = revision
	}

	return information
}

func shortRevision(revision string) string {
	return revision[:min(len(revision), shortRevisionLength)]
}

// pseudoVersionRevision extracts the revision when module metadata is the only
// source available (for example, builds from a module cache without a VCS checkout).
func pseudoVersionRevision(version string) string {
	version, _, _ = strings.Cut(version, "+")
	prefix, revision, ok := strings.CutLast(version, "-")
	if !ok || len(revision) < shortRevisionLength || !isHex(revision) {
		return ""
	}

	_, timestamp, ok := strings.CutLast(prefix, "-")
	if !ok {
		return ""
	}
	if _, suffix, found := strings.CutLast(timestamp, "."); found {
		timestamp = suffix
	}
	if len(timestamp) != 14 || !isDecimal(timestamp) {
		return ""
	}
	return shortRevision(revision)
}

func isHex(value string) bool {
	for _, character := range value {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return false
		}
	}
	return value != ""
}

func isDecimal(value string) bool {
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return value != ""
}

func formatVersion(version, commit, buildTime string) string {
	return fmt.Sprintf("Navi %s (%s, %s)", version, commit, buildTime)
}
