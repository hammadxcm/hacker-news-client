package hackernews

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newStubServer spins up an in-process http.Server where routes maps exact
// request path (without query) to a handler. Unlisted paths → 404. Returns the
// base URL (http://127.0.0.1:<port>) and a shutdown func.
func newStubServer(t *testing.T, routes map[string]http.HandlerFunc) (string, func()) {
	t.Helper()
	mux := http.NewServeMux()
	for path, h := range routes {
		mux.HandleFunc(path, h)
	}
	srv := httptest.NewServer(mux)
	return srv.URL, srv.Close
}

// jsonHandler returns a handler that serves v as JSON with 200.
func jsonHandler(v any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}
}

// nullHandler returns HTTP 200 + literal "null".
func nullHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, "null")
	}
}

// statusHandler returns the given status with minimal body.
func statusHandler(code int) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(code)
		_, _ = io.WriteString(w, `{}`)
	}
}

// slowHandler delays then returns v as JSON (for timeout tests).
func slowHandler(d time.Duration, v any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(d)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}
}

var storyPayload = map[string]any{
	"by":          "pg",
	"descendants": 3,
	"id":          1,
	"kids":        []int{15},
	"score":       57,
	"time":        1160418111,
	"title":       "Y Combinator",
	"type":        "story",
	"url":         "http://ycombinator.com",
}

func TestNewDefaults_Unit(t *testing.T) {
	t.Setenv("HN_BASE", "")
	c := New(Options{})
	if c.BaseURL != DefaultBaseURL {
		t.Errorf("BaseURL = %q, want default", c.BaseURL)
	}
	if c.Timeout != DefaultTimeout {
		t.Errorf("Timeout = %v", c.Timeout)
	}
	if c.Concurrency != DefaultConcurrency {
		t.Errorf("Concurrency = %d", c.Concurrency)
	}
	if c.UserAgent != DefaultUserAgent {
		t.Errorf("UserAgent = %q", c.UserAgent)
	}
}

func TestNewHonorsEnvBase_Unit(t *testing.T) {
	t.Setenv("HN_BASE", "http://env.test/v0///")
	c := New(Options{})
	if c.BaseURL != "http://env.test/v0" {
		t.Errorf("BaseURL = %q, want stripped", c.BaseURL)
	}
}

func TestNewExplicitOptions_Unit(t *testing.T) {
	custom := &http.Client{Timeout: time.Second}
	c := New(Options{
		BaseURL:     "http://x/v0/",
		Timeout:     5 * time.Second,
		Concurrency: 3,
		UserAgent:   "custom/1.0",
		HTTPClient:  custom,
	})
	if c.BaseURL != "http://x/v0" {
		t.Errorf("BaseURL not trimmed: %q", c.BaseURL)
	}
	if c.http != custom {
		t.Error("HTTPClient not propagated")
	}
}

func TestItemDecodesStory_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": jsonHandler(storyPayload),
	})
	defer shutdown()

	c := New(Options{BaseURL: base})
	it, err := c.Item(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	s, ok := it.(Story)
	if !ok {
		t.Fatalf("expected Story, got %T", it)
	}
	if s.Title != "Y Combinator" || s.By != "pg" {
		t.Errorf("decode: %+v", s)
	}
}

func TestItemEachVariant_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": jsonHandler(map[string]any{"id": 1, "type": "comment", "time": 1, "text": "t", "parent": 0}),
		"/item/2.json": jsonHandler(map[string]any{"id": 2, "type": "job", "time": 1, "title": "t", "score": 1}),
		"/item/3.json": jsonHandler(map[string]any{"id": 3, "type": "poll", "time": 1, "score": 1, "parts": []int{10, 11}}),
		"/item/4.json": jsonHandler(map[string]any{"id": 4, "type": "pollopt", "time": 1, "poll": 3, "score": 1}),
	})
	defer shutdown()

	c := New(Options{BaseURL: base})
	ctx := context.Background()
	if _, err := c.Item(ctx, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Item(ctx, 2); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Item(ctx, 3); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Item(ctx, 4); err != nil {
		t.Fatal(err)
	}
}

func TestItemNullBody_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/0.json": nullHandler(),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	it, err := c.Item(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if it != nil {
		t.Errorf("expected nil, got %v", it)
	}
}

func TestItemDeletedStub_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/9.json": jsonHandler(map[string]any{"id": 9, "type": "comment", "deleted": true, "time": 1}),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	it, err := c.Item(context.Background(), 9)
	if err != nil {
		t.Fatal(err)
	}
	if it != nil {
		t.Errorf("expected nil for deleted stub, got %v", it)
	}
}

func TestItemUnknownType_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": jsonHandler(map[string]any{"id": 1, "type": "future", "time": 1}),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.Item(context.Background(), 1)
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestItemInvalidJSON_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, "not-json")
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.Item(context.Background(), 1)
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestHTTPErrorPropagates_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": statusHandler(503),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.Item(context.Background(), 1)
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 503 {
		t.Errorf("expected HTTPError 503, got %v", err)
	}
	if !strings.Contains(he.URL, "/item/1.json") {
		t.Errorf("HTTPError.URL = %q", he.URL)
	}
	if he.Error() == "" {
		t.Error("HTTPError.Error() empty")
	}
}

func TestHTTP404(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.User(context.Background(), "foo")
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 404 {
		t.Errorf("expected HTTPError 404, got %v", err)
	}
}

func TestTransportFailure_Unit(t *testing.T) {
	// Unreachable URL (closed port) → transport error.
	c := New(Options{BaseURL: "http://127.0.0.1:1"})
	_, err := c.Item(context.Background(), 1)
	if !errors.Is(err, ErrTransport) {
		t.Errorf("expected ErrTransport, got %v", err)
	}
}

func TestTimeoutViaContextDeadline_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": slowHandler(200*time.Millisecond, storyPayload),
	})
	defer shutdown()
	c := New(Options{BaseURL: base, Timeout: 30 * time.Millisecond})
	_, err := c.Item(context.Background(), 1)
	if !errors.Is(err, ErrTimeout) {
		t.Errorf("expected ErrTimeout, got %v", err)
	}
}

func TestItemsOrderAndNullDrop_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": jsonHandler(storyPayload),
		"/item/2.json": nullHandler(),
		"/item/3.json": jsonHandler(map[string]any{"id": 3, "type": "story", "time": 1, "title": "t", "score": 1, "descendants": 0}),
	})
	defer shutdown()
	c := New(Options{BaseURL: base, Concurrency: 3})
	out, err := c.Items(context.Background(), []int64{1, 2, 3})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0].ID() != 1 || out[1].ID() != 3 {
		t.Errorf("unexpected items: %v", out)
	}
}

func TestItemsEmpty_Unit(t *testing.T) {
	c := New(Options{BaseURL: "http://unused"})
	out, err := c.Items(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 0 {
		t.Errorf("expected empty, got %v", out)
	}
}

func TestItemsFailFast_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": func(w http.ResponseWriter, _ *http.Request) {
			time.Sleep(20 * time.Millisecond)
			_, _ = io.WriteString(w, `null`)
		},
		"/item/99.json": statusHandler(500),
	})
	defer shutdown()
	c := New(Options{BaseURL: base, Concurrency: 2})
	_, err := c.Items(context.Background(), []int64{1, 99, 1, 1, 1})
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 500 {
		t.Fatalf("expected HTTPError 500, got %v", err)
	}
}

func TestUserKnownAndUnknown_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/user/pg.json": jsonHandler(map[string]any{
			"id": "pg", "created": 1, "karma": 100, "submitted": []int{1},
		}),
		"/user/nobody.json": nullHandler(),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	u, err := c.User(context.Background(), "pg")
	if err != nil || u.ID != "pg" {
		t.Errorf("user pg: %v, %v", u, err)
	}
	u2, err := c.User(context.Background(), "nobody")
	if err != nil || u2 != nil {
		t.Errorf("user nobody: %v, %v", u2, err)
	}
}

func TestUserInvalidJSON_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/user/x.json": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "not-json")
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.User(context.Background(), "x")
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestScalarsAndLists_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/maxitem.json":     jsonHandler(123),
		"/updates.json":     jsonHandler(map[string]any{"items": []int{1}, "profiles": []string{"pg"}}),
		"/topstories.json":  jsonHandler([]int{1, 2}),
		"/newstories.json":  jsonHandler([]int{}),
		"/beststories.json": jsonHandler([]int{}),
		"/askstories.json":  jsonHandler([]int{}),
		"/showstories.json": jsonHandler([]int{}),
		"/jobstories.json":  jsonHandler([]int{}),
		"/item/1.json":      jsonHandler(storyPayload),
		"/item/2.json":      jsonHandler(map[string]any{"id": 2, "type": "story", "time": 1, "title": "t", "score": 1, "descendants": 0}),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	ctx := context.Background()

	if v, _ := c.MaxItem(ctx); v != 123 {
		t.Errorf("maxitem %d", v)
	}
	if u, _ := c.Updates(ctx); len(u.Items) != 1 {
		t.Errorf("updates %+v", u)
	}

	for _, fn := range []func(context.Context) ([]int64, error){
		c.TopStoryIDs, c.NewStoryIDs, c.BestStoryIDs,
		c.AskStoryIDs, c.ShowStoryIDs, c.JobStoryIDs,
	} {
		if _, err := fn(ctx); err != nil {
			t.Errorf("ids: %v", err)
		}
	}

	// Hydration helpers — default limit path (passing 0 → DefaultStoriesLimit).
	for _, fn := range []func(context.Context, int) ([]Item, error){
		c.TopStories, c.NewStories, c.BestStories, c.AskStories, c.ShowStories, c.JobStories,
	} {
		if _, err := fn(ctx, 0); err != nil {
			t.Errorf("stories: %v", err)
		}
	}
	// limit > 0 path
	top, _ := c.TopStories(ctx, 2)
	if len(top) > 2 {
		t.Errorf("limit=2 got %d", len(top))
	}
}

func TestMaxItemDecodeError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/maxitem.json": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `"nope"`)
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.MaxItem(context.Background())
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestUpdatesDecodeError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/updates.json": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `"nope"`)
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.Updates(context.Background())
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestIDListDecodeError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/topstories.json": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, `"nope"`)
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.TopStoryIDs(context.Background())
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestCommentTreePrunesDeletedAndNull_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/100.json": jsonHandler(map[string]any{
			"id": 100, "type": "comment", "time": 1, "kids": []int{101, 102, 103},
		}),
		"/item/101.json": jsonHandler(map[string]any{"id": 101, "type": "comment", "time": 1}),
		"/item/102.json": jsonHandler(map[string]any{"id": 102, "type": "comment", "deleted": true, "time": 1}),
		"/item/103.json": nullHandler(),
	})
	defer shutdown()
	c := New(Options{BaseURL: base, Concurrency: 2})
	root, err := c.CommentTree(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if root == nil || len(root.Replies) != 1 || root.Replies[0].IDField != 101 {
		t.Errorf("unexpected replies: %+v", root)
	}
}

func TestCommentTreeRootNull_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/999.json": nullHandler(),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	root, err := c.CommentTree(context.Background(), 999)
	if err != nil || root != nil {
		t.Errorf("expected nil, got %v, %v", root, err)
	}
}

func TestCommentTreeDecodeError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "not-json")
		},
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.CommentTree(context.Background(), 1)
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
}

func TestCommentTreeHTTPError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": statusHandler(500),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.CommentTree(context.Background(), 1)
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 500 {
		t.Errorf("expected HTTPError 500, got %v", err)
	}
}

func TestBaseTypeAccessors_Unit(t *testing.T) {
	s := Story{Base: Base{IDField: 7, TypeField: "story"}}
	if s.ID() != 7 || s.Kind() != "story" {
		t.Errorf("accessors: id=%d kind=%q", s.ID(), s.Kind())
	}
}

// Explicitly exercise the sealing isItem() tag methods on every variant.
// They are no-ops that exist only to prove each concrete type implements Item.
func TestIsItemSealingMethods_Unit(t *testing.T) {
	var _ Item = Story{}
	var _ Item = Comment{}
	var _ Item = Job{}
	var _ Item = Poll{}
	var _ Item = PollOpt{}
	Story{}.isItem()
	Comment{}.isItem()
	Job{}.isItem()
	Poll{}.isItem()
	PollOpt{}.isItem()
}

// decodeItem edge cases not covered elsewhere: empty body and "null".
func TestDecodeItemEdgeCases_Unit(t *testing.T) {
	v, err := decodeItem([]byte(""))
	if err != nil || v != nil {
		t.Errorf("empty: %v, %v", v, err)
	}
	v, err = decodeItem([]byte("null"))
	if err != nil || v != nil {
		t.Errorf("null: %v, %v", v, err)
	}
	v, err = decodeItem([]byte("  null  \n "))
	if err != nil || v != nil {
		t.Errorf("padded null: %v, %v", v, err)
	}
	if _, err := decodeItem([]byte("not-json")); !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode for not-json, got %v", err)
	}
}

// trimJSON: trailing whitespace branch.
func TestTrimJSON_Unit(t *testing.T) {
	got := trimJSON([]byte("  \t\rhello\n\t  "))
	if string(got) != "hello" {
		t.Errorf("trimJSON = %q", got)
	}
	// All-whitespace
	got = trimJSON([]byte("   "))
	if len(got) != 0 {
		t.Errorf("all-whitespace: %q", got)
	}
}

// hydrate path where limit > len(ids) (no truncation).
func TestMaxItemHTTPError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/maxitem.json": statusHandler(503),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.MaxItem(context.Background())
	var he *HTTPError
	if !errors.As(err, &he) {
		t.Errorf("expected HTTPError, got %v", err)
	}
}

func TestUpdatesHTTPError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/updates.json": statusHandler(503),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.Updates(context.Background())
	var he *HTTPError
	if !errors.As(err, &he) {
		t.Errorf("expected HTTPError, got %v", err)
	}
}

func TestIDListHTTPError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/topstories.json": statusHandler(503),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.TopStoryIDs(context.Background())
	var he *HTTPError
	if !errors.As(err, &he) {
		t.Errorf("expected HTTPError, got %v", err)
	}
}

func TestHydrateFetchError_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/topstories.json": statusHandler(503),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	_, err := c.TopStories(context.Background(), 5)
	var he *HTTPError
	if !errors.As(err, &he) {
		t.Errorf("expected HTTPError, got %v", err)
	}
}

// decodeItem: valid JSON with right "type" but wrong inner field type.
func TestDecodeItemMalformedInner_Unit(t *testing.T) {
	// score expects an int but we pass a string — Unmarshal to Story fails.
	_, err := decodeItem([]byte(`{"type":"story","id":1,"score":"not-a-number"}`))
	if !errors.Is(err, ErrDecode) {
		t.Errorf("expected ErrDecode, got %v", err)
	}
	_, err = decodeItem([]byte(`{"type":"comment","id":1,"parent":"bad"}`))
	if !errors.Is(err, ErrDecode) {
		t.Errorf("comment bad: %v", err)
	}
	_, err = decodeItem([]byte(`{"type":"job","id":1,"score":"x"}`))
	if !errors.Is(err, ErrDecode) {
		t.Errorf("job bad: %v", err)
	}
	_, err = decodeItem([]byte(`{"type":"poll","id":1,"parts":"bad"}`))
	if !errors.Is(err, ErrDecode) {
		t.Errorf("poll bad: %v", err)
	}
	_, err = decodeItem([]byte(`{"type":"pollopt","id":1,"poll":"bad"}`))
	if !errors.Is(err, ErrDecode) {
		t.Errorf("pollopt bad: %v", err)
	}
}

func TestHydrateNoTruncation_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/topstories.json": jsonHandler([]int{1}),
		"/item/1.json":     jsonHandler(storyPayload),
	})
	defer shutdown()
	c := New(Options{BaseURL: base})
	out, err := c.TopStories(context.Background(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Errorf("expected 1, got %d", len(out))
	}
}

func TestHTTPErrorContextCancelled_Unit(t *testing.T) {
	base, shutdown := newStubServer(t, map[string]http.HandlerFunc{
		"/item/1.json": slowHandler(500*time.Millisecond, storyPayload),
	})
	defer shutdown()
	c := New(Options{BaseURL: base, Timeout: time.Second})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := c.Item(ctx, 1)
	if !errors.Is(err, ErrTimeout) {
		t.Errorf("expected ErrTimeout, got %v", err)
	}
}

// TestCommentTreeDeepChain_NoDeadlock is a regression test for the C1 deadlock.
// Previous visit() held a semaphore permit across the recursive wg.Wait(),
// causing any chain longer than Concurrency to hang forever. With the fix,
// this test completes in milliseconds.
func TestCommentTreeDeepChain_NoDeadlock_Unit(t *testing.T) {
	// Build a 15-link linear chain: 1 → 2 → 3 → ... → 15.
	routes := map[string]http.HandlerFunc{}
	depth := 15
	for i := 1; i <= depth; i++ {
		i := i
		node := map[string]any{
			"id":   i,
			"type": "comment",
			"time": 1,
			"text": "node",
		}
		if i < depth {
			node["kids"] = []int{i + 1}
		}
		routes[fmt.Sprintf("/item/%d.json", i)] = jsonHandler(node)
	}
	base, shutdown := newStubServer(t, routes)
	defer shutdown()

	// Concurrency = 3, chain depth = 15. Pre-fix: deadlocks forever.
	c := New(Options{BaseURL: base, Concurrency: 3, Timeout: 2 * time.Second})

	done := make(chan *CommentTreeNode, 1)
	errCh := make(chan error, 1)
	go func() {
		root, err := c.CommentTree(context.Background(), 1)
		if err != nil {
			errCh <- err
			return
		}
		done <- root
	}()

	select {
	case err := <-errCh:
		t.Fatalf("unexpected error: %v", err)
	case root := <-done:
		// Verify we actually walked the full chain: 15 nodes on the single
		// spine. Count: root + 14 descendants.
		count := 0
		var walk func(n *CommentTreeNode)
		walk = func(n *CommentTreeNode) {
			if n == nil {
				return
			}
			count++
			for _, r := range n.Replies {
				walk(r)
			}
		}
		walk(root)
		if count != depth {
			t.Errorf("expected %d nodes, got %d (deadlock may have masked nodes)", depth, count)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("CommentTree deadlocked on a 15-deep chain with Concurrency=3")
	}
}
