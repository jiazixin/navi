package app

import (
	"encoding/json/v2"
	"errors"
	"net/http"
)

// apiError is the body of every failed API response. Code is the only value
// clients branch on; Message is English text for developers and is never shown
// to users. See docs/API.md.
type apiError struct {
	Error apiErrorBody `json:"error"`
}

type apiErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitzero"`
}

// apiFailure is an API failure with a fixed status, code and English message.
type apiFailure struct {
	status  int
	code    string
	message string
	details map[string]any
}

func (f *apiFailure) Error() string { return f.message }

// Failures reported by the API.
var (
	errInternal          = &apiFailure{status: http.StatusInternalServerError, code: "internal", message: "internal error"}
	errMethodNotAllowed  = &apiFailure{status: http.StatusMethodNotAllowed, code: "method_not_allowed", message: "request method not supported"}
	errPrecondition      = &apiFailure{status: http.StatusPreconditionFailed, code: "precondition_failed", message: "resource precondition failed"}
	errInvalidRange      = &apiFailure{status: http.StatusRequestedRangeNotSatisfiable, code: "invalid_argument", message: "requested byte range cannot be served"}
	errNoRoute           = &apiFailure{status: http.StatusNotFound, code: "not_found", message: "no such API endpoint"}
	errCatalogMissing    = &apiFailure{status: http.StatusServiceUnavailable, code: "catalog_unavailable", message: "catalog not available yet"}
	errIconsUnavailable  = &apiFailure{status: http.StatusNotFound, code: "icon_cache_unavailable", message: "icon cache unavailable"}
	errIconNotFound      = &apiFailure{status: http.StatusNotFound, code: "not_found", message: "icon not found"}
	errFrontendMissing   = &apiFailure{status: http.StatusServiceUnavailable, code: "frontend_not_built", message: "frontend assets not built"}
	errAssetNotFound     = &apiFailure{status: http.StatusNotFound, code: "not_found", message: "static asset not found"}
	errLoginRequired     = &apiFailure{status: http.StatusUnauthorized, code: "unauthenticated", message: "login required"}
	errOriginRejected    = &apiFailure{status: http.StatusForbidden, code: "permission_denied", message: "cross-site request rejected"}
	errLoginLimited      = &apiFailure{status: http.StatusTooManyRequests, code: "rate_limited", message: "too many login attempts; retry in a minute"}
	errLoginBody         = &apiFailure{status: http.StatusBadRequest, code: "invalid_argument", message: "login request must be one valid JSON object", details: map[string]any{"fields": []map[string]string{{"path": "", "reason": "invalid_json"}}}}
	errLoginTooLarge     = &apiFailure{status: http.StatusRequestEntityTooLarge, code: "payload_too_large", message: "login request is too large"}
	errNotJSON           = &apiFailure{status: http.StatusUnsupportedMediaType, code: "unsupported_media_type", message: "request body must be application/json"}
	errBadLogin          = &apiFailure{status: http.StatusUnauthorized, code: "invalid_credentials", message: "invalid username or password"}
	errSessionsExhausted = &apiFailure{status: http.StatusServiceUnavailable, code: "sessions_full", message: "session limit reached"}
)

// writeError writes the JSON error body for err. Known failures keep their
// status and code; any other error is logged and answered as 500 internal.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	failure, ok := errors.AsType[*apiFailure](err)
	if !ok {
		requestLogger(r).Error("request_failed", "method", r.Method, "path", r.URL.Path, "error", err)
		failure = errInternal
	}
	writeJSON(w, r, jsonResponse{Status: failure.status, Payload: apiError{Error: apiErrorBody{Code: failure.code, Message: failure.message, Details: failure.details}}})
}

type jsonResponse struct {
	Status  int
	Payload any
}

func writeJSON(w http.ResponseWriter, r *http.Request, response jsonResponse) {
	encoded, err := json.Marshal(response.Payload)
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(response.Status)
	if _, err := w.Write(encoded); err != nil {
		// The response has started, so report the transport failure without a second body.
		requestLogger(r).Debug("response_write_failed", "error", err)
	}
}
