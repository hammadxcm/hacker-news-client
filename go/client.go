package hackernews

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// DefaultBaseURL is the Firebase HN API root.
const DefaultBaseURL = "https://hacker-news.firebaseio.com/v0"

// DefaultTimeout is the per-request total budget.
const DefaultTimeout = 10 * time.Second

// DefaultConcurrency bounds batch fan-out.
const DefaultConcurrency = 10

// DefaultUserAgent identifies the client.
const DefaultUserAgent = "hn-client-go/0.1.0"

// DefaultStoriesLimit is the default limit for *Stories() hydration calls.
const DefaultStoriesLimit = 30

// Options configures a Client.
type Options struct {
	BaseURL     string
	Timeout     time.Duration
	Concurrency int
	UserAgent   string
	HTTPClient  *http.Client
}

// Client is a thread-safe client for the HN Firebase API.
//
// Example:
//
//	c := hackernews.New(hackernews.Options{})
//	item, err := c.Item(ctx, 1)
//	if err != nil { ... }
//	if s, ok := item.(hackernews.Story); ok { fmt.Println(s.Title) }
type Client struct {
	BaseURL     string
	Timeout     time.Duration
	Concurrency int
	UserAgent   string
	http        *http.Client
}

// New returns a Client with the given options. Zero-valued fields pick up defaults.
// If BaseURL is empty and the HN_BASE env var is set, HN_BASE is used.
func New(opts Options) *Client {
	base := opts.BaseURL
	if base == "" {
		base = os.Getenv("HN_BASE")
	}
	if base == "" {
		base = DefaultBaseURL
	}
	base = strings.TrimRight(base, "/")
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = DefaultTimeout
	}
	conc := opts.Concurrency
	if conc == 0 {
		conc = DefaultConcurrency
	}
	ua := opts.UserAgent
	if ua == "" {
		ua = DefaultUserAgent
	}
	client := opts.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	return &Client{BaseURL: base, Timeout: timeout, Concurrency: conc, UserAgent: ua, http: client}
}

// rawGET executes a GET against path and returns the raw body bytes.
// Wraps transport / HTTP-status / timeout errors in the package's error types.
func (c *Client) rawGET(ctx context.Context, path string) ([]byte, error) {
	u := c.BaseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTransport, err)
	}
	req.Header.Set("User-Agent", c.UserAgent)
	resp, err := c.http.Do(req)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) && urlErr.Timeout() {
			return nil, fmt.Errorf("%w at %s", ErrTimeout, u)
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("%w at %s", ErrTimeout, u)
		}
		return nil, fmt.Errorf("%w: %v", ErrTransport, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		// drain body to allow connection reuse, ignore error
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil, &HTTPError{Status: resp.StatusCode, URL: u}
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTransport, err)
	}
	return body, nil
}

// Item fetches a single item. Returns (nil, nil) for unknown ids and {deleted:true} stubs.
//
// Example:
//
//	it, err := c.Item(ctx, 1)
func (c *Client) Item(ctx context.Context, id int64) (Item, error) {
	body, err := c.rawGET(ctx, fmt.Sprintf("/item/%d.json", id))
	if err != nil {
		return nil, err
	}
	return decodeItem(body)
}

// Items fetches the given ids with bounded concurrency. Drops nil entries
// (unknown / deleted); survivors preserve relative input order. Fails fast: the
// first error cancels siblings via context and is returned unchanged.
func (c *Client) Items(ctx context.Context, ids []int64) ([]Item, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	batchCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	results := make([]Item, len(ids))
	var firstErr error
	var errMu sync.Mutex
	sem := make(chan struct{}, c.Concurrency)
	var wg sync.WaitGroup

	for i, id := range ids {
		i, id := i, id
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-batchCtx.Done():
				return
			}
			it, err := c.Item(batchCtx, id)
			if err != nil {
				errMu.Lock()
				if firstErr == nil {
					firstErr = err
					cancel()
				}
				errMu.Unlock()
				return
			}
			results[i] = it
		}()
	}
	wg.Wait()
	errMu.Lock()
	err := firstErr
	errMu.Unlock()
	if err != nil {
		return nil, err
	}
	// Drop nils, preserve order.
	out := make([]Item, 0, len(results))
	for _, r := range results {
		if r != nil {
			out = append(out, r)
		}
	}
	return out, nil
}

// User fetches a user profile. Returns (nil, nil) for unknown usernames.
func (c *Client) User(ctx context.Context, username string) (*User, error) {
	body, err := c.rawGET(ctx, fmt.Sprintf("/user/%s.json", username))
	if err != nil {
		return nil, err
	}
	if string(trimJSON(body)) == "null" {
		return nil, nil
	}
	var u User
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecode, err)
	}
	return &u, nil
}

// MaxItem returns the current largest item id.
func (c *Client) MaxItem(ctx context.Context) (int64, error) {
	body, err := c.rawGET(ctx, "/maxitem.json")
	if err != nil {
		return 0, err
	}
	var n int64
	if err := json.Unmarshal(body, &n); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrDecode, err)
	}
	return n, nil
}

// Updates returns the recently-changed items and profiles.
func (c *Client) Updates(ctx context.Context) (*Updates, error) {
	body, err := c.rawGET(ctx, "/updates.json")
	if err != nil {
		return nil, err
	}
	var u Updates
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecode, err)
	}
	return &u, nil
}

func (c *Client) idList(ctx context.Context, path string) ([]int64, error) {
	body, err := c.rawGET(ctx, path)
	if err != nil {
		return nil, err
	}
	var ids []int64
	if err := json.Unmarshal(body, &ids); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecode, err)
	}
	return ids, nil
}

// TopStoryIDs returns up to 500 ranked story ids.
func (c *Client) TopStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/topstories.json")
}

// NewStoryIDs returns up to 500 reverse-chronological story ids.
func (c *Client) NewStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/newstories.json")
}

// BestStoryIDs returns up to 500 best-ranked story ids (live cap ~200).
func (c *Client) BestStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/beststories.json")
}

// AskStoryIDs returns up to 200 Ask HN story ids.
func (c *Client) AskStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/askstories.json")
}

// ShowStoryIDs returns up to 200 Show HN story ids.
func (c *Client) ShowStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/showstories.json")
}

// JobStoryIDs returns up to 200 job-listing ids.
func (c *Client) JobStoryIDs(ctx context.Context) ([]int64, error) {
	return c.idList(ctx, "/jobstories.json")
}

func (c *Client) hydrate(ctx context.Context, fetcher func(context.Context) ([]int64, error), limit int) ([]Item, error) {
	ids, err := fetcher(ctx)
	if err != nil {
		return nil, err
	}
	if limit > 0 && len(ids) > limit {
		ids = ids[:limit]
	}
	return c.Items(ctx, ids)
}

// TopStories hydrates the first `limit` top stories. limit<=0 means DefaultStoriesLimit.
func (c *Client) TopStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.TopStoryIDs, limit)
}

// NewStories hydrates the first `limit` newest stories.
func (c *Client) NewStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.NewStoryIDs, limit)
}

// BestStories hydrates the first `limit` best stories.
func (c *Client) BestStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.BestStoryIDs, limit)
}

// AskStories hydrates the first `limit` Ask HN stories.
func (c *Client) AskStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.AskStoryIDs, limit)
}

// ShowStories hydrates the first `limit` Show HN stories.
func (c *Client) ShowStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.ShowStoryIDs, limit)
}

// JobStories hydrates the first `limit` job listings.
func (c *Client) JobStories(ctx context.Context, limit int) ([]Item, error) {
	if limit <= 0 {
		limit = DefaultStoriesLimit
	}
	return c.hydrate(ctx, c.JobStoryIDs, limit)
}

// CommentTree recursively fetches the comment tree rooted at id. Uses one
// global semaphore (bounded by c.Concurrency) across the whole tree. Deleted
// nodes are pruned. Fails fast: any error cancels the tree and is returned.
//
// Returns (nil, nil) if the root itself is deleted or missing.
func (c *Client) CommentTree(ctx context.Context, id int64) (*CommentTreeNode, error) {
	treeCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sem := make(chan struct{}, c.Concurrency)
	var firstErr error
	var errMu sync.Mutex

	setErr := func(err error) {
		errMu.Lock()
		if firstErr == nil {
			firstErr = err
			cancel()
		}
		errMu.Unlock()
	}

	var visit func(nodeID int64) *CommentTreeNode
	visit = func(nodeID int64) *CommentTreeNode {
		select {
		case sem <- struct{}{}:
			defer func() { <-sem }()
		case <-treeCtx.Done():
			return nil
		}
		body, err := c.rawGET(treeCtx, fmt.Sprintf("/item/%d.json", nodeID))
		if err != nil {
			setErr(err)
			return nil
		}
		trimmed := trimJSON(body)
		if string(trimmed) == "null" {
			return nil
		}
		var raw struct {
			ID      int64   `json:"id"`
			By      string  `json:"by"`
			Time    int64   `json:"time"`
			Parent  int64   `json:"parent"`
			Text    string  `json:"text"`
			Kids    []int64 `json:"kids"`
			Dead    bool    `json:"dead"`
			Type    string  `json:"type"`
			Deleted bool    `json:"deleted"`
		}
		if err := json.Unmarshal(body, &raw); err != nil {
			setErr(fmt.Errorf("%w: %v", ErrDecode, err))
			return nil
		}
		if raw.Deleted {
			return nil
		}
		// Fan-out children in parallel, each calling visit recursively (which
		// itself acquires the same semaphore). Because visit returns before
		// its children's fetches enter the semaphore, there's no deadlock.
		replies := make([]*CommentTreeNode, len(raw.Kids))
		var wg sync.WaitGroup
		for i, kid := range raw.Kids {
			i, kid := i, kid
			wg.Add(1)
			go func() {
				defer wg.Done()
				replies[i] = visit(kid)
			}()
		}
		wg.Wait()
		out := &CommentTreeNode{
			Comment: Comment{
				Base:   Base{IDField: raw.ID, TypeField: raw.Type, By: raw.By, Time: raw.Time, Dead: raw.Dead},
				Parent: raw.Parent,
				Text:   raw.Text,
				Kids:   raw.Kids,
			},
		}
		for _, r := range replies {
			if r != nil {
				out.Replies = append(out.Replies, r)
			}
		}
		return out
	}

	root := visit(id)
	errMu.Lock()
	err := firstErr
	errMu.Unlock()
	if err != nil {
		return nil, err
	}
	return root, nil
}
