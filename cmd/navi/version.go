package main

import "fmt"

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

func formatVersion(version, commit, buildTime string) string {
	return fmt.Sprintf("Navi %s (%s, %s)", version, commit, buildTime)
}
