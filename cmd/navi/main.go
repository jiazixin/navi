// Command navi starts the Navi service.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"navi/internal/app"
	"navi/internal/config"
)

func main() {
	options, err := parseCLI(os.Args[1:], os.Stdout)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "navi: %v\n", err)
		os.Exit(2)
	}
	build := currentBuildInformation()
	if options.showVersion {
		fmt.Fprintln(os.Stdout, formatVersion(build.version, build.commit, build.buildTime))
		return
	}

	loaded, err := config.Load(options.lookupEnv(os.LookupEnv))
	if err != nil {
		fmt.Fprintf(os.Stderr, "navi: %v\n", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger := app.NewLogger(loaded.Logging, os.Stdout).With(
		"version", build.version,
		"commit", build.commit,
		"build_time", build.buildTime,
	)
	if err := app.Run(ctx, loaded, logger); err != nil {
		fmt.Fprintf(os.Stderr, "navi: %v\n", err)
		os.Exit(1)
	}
}
