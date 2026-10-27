package app

import (
	"bytes"
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"
)

func TestLoginValidationSharedContract(t *testing.T) {
	contents, err := os.ReadFile("../../tests/fixtures/api/login-invalid-length.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Request  loginCredentials `json:"request"`
		Status   int              `json:"status"`
		Response apiError         `json:"response"`
	}
	if err := json.Unmarshal(contents, &fixture); err != nil {
		t.Fatal(err)
	}
	body, err := json.Marshal(fixture.Request)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	authServer(t).ServeHTTP(response, request)
	if response.Code != fixture.Status {
		t.Fatalf("got %d, want %d", response.Code, fixture.Status)
	}
	var actual apiError
	if err := json.Unmarshal(response.Body.Bytes(), &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, fixture.Response) {
		t.Fatalf("got %#v, want %#v", actual, fixture.Response)
	}
}
