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
	if got := string(encoded); got != `{"type":"favicon.updated","runtime_id":"github"}` {
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

func TestSubscriberCapacityIsBounded(t *testing.T) {
	hub := newEventHub()
	defer hub.Close()
	for range maxEventSubscribers {
		hub.Subscribe()
	}
	extra := hub.Subscribe()
	select {
	case _, ok := <-extra.Events():
		if ok {
			t.Fatal("excess subscription remained active")
		}
	default:
		t.Fatal("excess subscription was not rejected")
	}
	if len(hub.subs) != maxEventSubscribers {
		t.Fatal("subscriber capacity exceeded")
	}
}
