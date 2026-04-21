// Package hackernews provides a Go client for the official Hacker News Firebase API.
package hackernews

import (
	"errors"
	"fmt"
)

// Sentinel errors. Callers check with errors.Is.
var (
	// ErrTimeout is returned when a request exceeds the client's Timeout budget.
	ErrTimeout = errors.New("hn: timeout")
	// ErrDecode is returned when the response body cannot be decoded.
	ErrDecode = errors.New("hn: decode")
	// ErrTransport is returned on DNS / TLS / connection failures.
	ErrTransport = errors.New("hn: transport")
)

// HTTPError is returned when the server responds with a non-2xx status.
// Callers check with errors.As. Body carries up to 1 KiB of the response body
// (may be empty when the body was empty or a network error interrupted drain).
type HTTPError struct {
	Status int
	URL    string
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("hn: http %d", e.Status)
}
