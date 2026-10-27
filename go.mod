module navi

go 1.27.3

require (
	github.com/fsnotify/fsnotify v1.9.0
	go.yaml.in/yaml/v3 v3.0.4
	golang.org/x/crypto v0.57.0
	golang.org/x/net v0.60.0
)

require golang.org/x/sys v0.48.0 // indirect

ignore ./web/node_modules
