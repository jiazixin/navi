package catalog

import (
	"encoding/json"
	"testing"
)

func TestFaviconEventCarriesRuntimeIDInSSEPayload(t *testing.T) {
	t.Parallel()
	encoded, err := json.Marshal(Event{Type: EventFaviconUpdated, RuntimeID: "github"})
	if err != nil {
		t.Fatal(err)
	}
	if got := string(encoded); got != `{"type":"favicon.updated","runtimeId":"github"}` {
		t.Fatalf("event payload = %s", got)
	}
}
