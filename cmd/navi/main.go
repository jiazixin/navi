// Command navi starts the Navi service.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"navi/internal/app"
	"navi/internal/config"
)

var (
	version   = "dev"
	commit    = "unknown"
	buildTime = "unknown"
)

func main() {
	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Printf("Navi %s (%s, %s)\n", version, commit, buildTime)
		return
	}
	if len(os.Args) > 1 && (os.Args[1] == "--help" || os.Args[1] == "-h") {
		fmt.Fprintln(os.Stdout, "Usage: navi | navi --version (CONFIG_FILE selects configuration; default: ./configs/config.local.yaml)")
		return
	}
	if len(os.Args) > 1 {
		fmt.Fprintln(os.Stderr, "navi: unexpected arguments; select configuration with CONFIG_FILE")
		os.Exit(1)
	}
	loaded, err := config.Load(os.LookupEnv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "navi: %v\n", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger := app.NewLogger(loaded.Logging, os.Stdout).With(
		"version", version,
		"commit", commit,
		"build_time", buildTime,
	)
	if err := app.Run(ctx, loaded, logger); err != nil {
		fmt.Fprintf(os.Stderr, "navi: %v\n", err)
		os.Exit(1)
	}
}
