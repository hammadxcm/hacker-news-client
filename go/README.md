# hacker-news-client/go

[![Go Reference](https://pkg.go.dev/badge/github.com/hammadkhan/hacker-news-client/go.svg)](https://pkg.go.dev/github.com/hammadkhan/hacker-news-client/go)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Go](https://img.shields.io/badge/go-%E2%89%A51.22-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![Coverage](https://img.shields.io/badge/coverage-98.3%25-brightgreen.svg?style=flat-square)](#tests)

Zero-dependency Go client for the [Hacker News Firebase API](https://github.com/HackerNews/API). Pure stdlib `net/http`. Idiomatic Go: `context.Context` on every I/O method, sealed `Item` interface with a custom `UnmarshalJSON` dispatcher, channel-semaphore + `sync.WaitGroup` concurrency. Part of the [cross-language `hacker-news-client` suite](../README.md).

## Install

```bash
go get github.com/hammadkhan/hacker-news-client/go
```

## Usage

```go
package main

import (
    "context"
    "fmt"
    "log"

    hackernews "github.com/hammadkhan/hacker-news-client/go"
)

func main() {
    c := hackernews.New(hackernews.Options{})
    ctx := context.Background()

    // Single item
    item, err := c.Item(ctx, 1)
    if err != nil {
        log.Fatal(err)
    }

    // Type-switch on the sealed Item interface
    switch v := item.(type) {
    case hackernews.Story:
        fmt.Printf("story: %s (%d points)\n", v.Title, v.Score)
    case hackernews.Comment:
        fmt.Printf("comment on %d: %s\n", v.Parent, v.Text)
    case nil:
        fmt.Println("deleted or missing")
    }

    // Batch — order-preserving, fail-fast
    items, _ := c.Items(ctx, []int64{1, 15, 100})
    _ = items

    // Top stories, hydrated
    top, _ := c.TopStories(ctx, 10)
    _ = top

    // Recursive comment tree
    tree, _ := c.CommentTree(ctx, 8863)
    _ = tree
}
```

## Configuration

```go
c := hackernews.New(hackernews.Options{
    BaseURL:     "https://hacker-news.firebaseio.com/v0", // default
    Timeout:     10 * time.Second,
    Concurrency: 10,
    UserAgent:   "my-app/1.0",
    HTTPClient:  customClient, // injectable *http.Client
})
```

The `HTTPClient` field is the standard injection point — tests swap in `httptest.NewServer`-backed clients. See [`unit_test.go`](./unit_test.go).

## Error handling

```go
import "errors"

item, err := c.Item(ctx, 1)
if err != nil {
    var httpErr *hackernews.HTTPError
    switch {
    case errors.As(err, &httpErr):
        log.Printf("HTTP %d at %s", httpErr.Status, httpErr.URL)
    case errors.Is(err, hackernews.ErrTimeout):
        log.Println("timed out")
    case errors.Is(err, hackernews.ErrTransport):
        log.Println("network failure")
    case errors.Is(err, hackernews.ErrDecode):
        log.Println("could not decode response")
    default:
        log.Println(err)
    }
    return
}
```

`(nil, nil)` from `Item()` / `User()` means the API returned `null` — not an error. Deleted stubs collapse to `nil`.

## Item variants

```go
type Item interface {
    isItem()     // unexported — seals the interface
    ID() int64
    Kind() string
}

// Concrete types, all implementing Item:
type Story struct   { Base; Title, URL, Text string; Score, Descendants int64; Kids []int64 }
type Comment struct { Base; Parent int64; Text string; Kids []int64 }
type Job struct     { Base; Title, URL, Text string; Score int64 }
type Poll struct    { Base; Title, Text string; Score, Descendants int64; Parts, Kids []int64 }
type PollOpt struct { Base; Poll int64; Score int64; Text string }
```

The package's internal `decodeItem` function peeks at the wire `type` field and dispatches to the concrete variant — consumers call high-level methods; only the package-internal decoder needs to know about the dispatcher.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md). Methods are `PascalCase` with `context.Context` as the first argument:

| Method | Returns |
|---|---|
| `Item(ctx, id)` | `(Item, error)` — `(nil, nil)` for null/deleted |
| `Items(ctx, ids)` | `([]Item, error)` — order-preserving, nils dropped |
| `User(ctx, username)` | `(*User, error)` — `(nil, nil)` for unknown |
| `MaxItem(ctx)` | `(int64, error)` |
| `Updates(ctx)` | `(*Updates, error)` |
| `TopStoryIDs(ctx)` / `NewStoryIDs` / `BestStoryIDs` / `AskStoryIDs` / `ShowStoryIDs` / `JobStoryIDs` | `([]int64, error)` |
| `TopStories(ctx, limit)` / ... | `([]Item, error)` — hydrated |
| `CommentTree(ctx, id)` | `(*CommentTreeNode, error)` |

## Tests

```bash
cd go
go test ./...                       # 41 tests: 16 integration + 25 unit
go test -race ./...                 # with race detector
go test -cover ./...                # coverage
go vet ./...                         # vet
gofmt -l . | test -z "$(cat -)"     # fmt check
```

Coverage: 98.3% of statements. The five `isItem()` tag methods on each variant are inlined by the Go compiler and not tracked by `go test -cover` — this is a known tooling quirk.

## Example

[`example/main.go`](./example/main.go):

```bash
go run ./example
```

## Links

- [Main repo README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [CONTRIBUTING](../CONTRIBUTING.md)
- [DESIGN.md](../DESIGN.md)

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
