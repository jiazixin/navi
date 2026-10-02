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

func TestMixedEventOverflowRequiresFullReconciliation(t *testing.T) {
	hub := newEventHub()
	defer hub.Close()
	sub := hub.Subscribe()
	defer sub.Close()
	hub.Publish(Event{Type: EventCatalogUpdated, Revision: 2})
	hub.Publish(Event{Type: EventFaviconUpdated, RuntimeID: "icon"})
	if got := <-sub.Events(); got.Type != EventCatalogUpdated {
		t.Fatalf("catalog update was lost: %+v", got)
	}
}
