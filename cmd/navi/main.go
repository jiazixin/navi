// Command navi starts the Navi service.
package main

import (
	"cmp"
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"navi/internal/app"
	"navi/internal/config"
)

const (
	exitOK      = 0
	exitFailure = 1
	exitUsage   = 2
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// run reports usage and startup errors as plain text on stderr; once the
// configuration loads, the service logs through its configured logger.
func run(args []string, stdout, stderr io.Writer) int {
	o, err := parseArgs(args)
	if err != nil {
		fmt.Fprintf(stderr, "navi: %v\nRun 'navi --help' for usage.\n", err)
		return exitUsage
	}
	build := currentBuild()
	switch {
	case o.help:
		fmt.Fprint(stdout, usage)
		return exitOK
	case o.version:
		fmt.Fprintln(stdout, "navi", build)
		return exitOK
	}
	loaded, err := config.Load(configEnv(o.configFile, os.LookupEnv))
	if err != nil {
		fmt.Fprintf(stderr, "navi: config: %v\n", err)
		return exitFailure
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger := app.NewLogger(loaded.Logging, stdout).With(
		"version", build.Version,
		"commit", cmp.Or(build.Revision, "unknown"),
		"build_time", cmp.Or(build.Time, "unknown"),
	)
	if err := app.Run(ctx, loaded, logger); err != nil {
		fmt.Fprintf(stderr, "navi: %v\n", err)
		return exitFailure
	}
	return exitOK
}

// configEnv makes --config take the place of CONFIG_FILE, which config.Load
// reads to select the configuration file.
func configEnv(file string, lookupEnv config.LookupEnv) config.LookupEnv {
	if file == "" {
		return lookupEnv
	}
	return func(name string) (string, bool) {
		if name == "CONFIG_FILE" {
			return file, true
		}
		return lookupEnv(name)
	}
}
