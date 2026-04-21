package hackernews

import (
	"bufio"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var (
	mockProc *exec.Cmd
	mockBase string
)

func TestMain(m *testing.M) {
	repoRoot, err := filepath.Abs("..")
	if err != nil {
		panic(err)
	}
	mockProc = exec.Command("node", filepath.Join(repoRoot, "test", "mock-server.js"))
	mockProc.Env = append(os.Environ(), "MOCK_PORT=0", "MOCK_SLOW_MS=100")
	stdout, err := mockProc.StdoutPipe()
	if err != nil {
		panic(err)
	}
	mockProc.Stderr = os.Stderr
	if err := mockProc.Start(); err != nil {
		panic(err)
	}
	line, err := bufio.NewReader(stdout).ReadString('\n')
	if err != nil {
		panic(err)
	}
	// "mock-server listening on http://localhost:<port>/v0"
	parts := strings.SplitN(line, " on ", 2)
	if len(parts) != 2 {
		panic("unexpected mock line: " + line)
	}
	mockBase = strings.TrimSpace(parts[1])

	code := m.Run()

	_ = mockProc.Process.Signal(os.Interrupt)
	done := make(chan error, 1)
	go func() { done <- mockProc.Wait() }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		_ = mockProc.Process.Kill()
	}
	os.Exit(code)
}

func newClient(t *testing.T) *Client {
	t.Helper()
	return New(Options{BaseURL: mockBase})
}

func TestItemStory(t *testing.T) {
	c := newClient(t)
	it, err := c.Item(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	s, ok := it.(Story)
	if !ok {
		t.Fatalf("expected Story, got %T", it)
	}
	if s.By != "pg" || s.Title != "Y Combinator" {
		t.Fatalf("unexpected story: %+v", s)
	}
}

func TestItemEachVariant(t *testing.T) {
	c := newClient(t)
	ctx := context.Background()
	for id, want := range map[int64]string{
		8001:   "comment",
		192327: "job",
		126809: "poll",
		126810: "pollopt",
	} {
		it, err := c.Item(ctx, id)
		if err != nil {
			t.Fatalf("item %d: %v", id, err)
		}
		if it.Kind() != want {
			t.Errorf("item %d: got kind %q, want %q", id, it.Kind(), want)
		}
	}
}

func TestItemNull(t *testing.T) {
	c := newClient(t)
	it, err := c.Item(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	if it != nil {
		t.Fatalf("expected nil for id 0, got %+v", it)
	}
}

func TestItemDeletedStub(t *testing.T) {
	c := newClient(t)
	it, err := c.Item(context.Background(), 8004)
	if err != nil {
		t.Fatal(err)
	}
	if it != nil {
		t.Fatalf("expected nil for deleted stub, got %+v", it)
	}
}

func TestItemDead(t *testing.T) {
	c := newClient(t)
	it, err := c.Item(context.Background(), 9999)
	if err != nil {
		t.Fatal(err)
	}
	com, ok := it.(Comment)
	if !ok {
		t.Fatalf("expected Comment, got %T", it)
	}
	if !com.Dead {
		t.Error("expected Dead=true")
	}
}

func TestItemsOrderAndNullDrop(t *testing.T) {
	c := newClient(t)
	out, err := c.Items(context.Background(), []int64{1, 0, 8001, 8004, 192327})
	if err != nil {
		t.Fatal(err)
	}
	ids := []int64{}
	for _, it := range out {
		ids = append(ids, it.ID())
	}
	want := []int64{1, 8001, 192327}
	if len(ids) != len(want) {
		t.Fatalf("got %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("got %v, want %v", ids, want)
		}
	}
}

func TestItemsFailFast500(t *testing.T) {
	c := newClient(t)
	_, err := c.Items(context.Background(), []int64{1, 99999999, 8001})
	if err == nil {
		t.Fatal("expected error")
	}
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 500 {
		t.Fatalf("expected HTTPError 500, got %v", err)
	}
}

func TestItemsEmpty(t *testing.T) {
	c := newClient(t)
	out, err := c.Items(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 0 {
		t.Fatalf("expected empty, got %v", out)
	}
}

func TestUser(t *testing.T) {
	c := newClient(t)
	u, err := c.User(context.Background(), "pg")
	if err != nil {
		t.Fatal(err)
	}
	if u == nil || u.ID != "pg" {
		t.Fatalf("unexpected user: %+v", u)
	}
	u2, err := c.User(context.Background(), "nobody")
	if err != nil {
		t.Fatal(err)
	}
	if u2 != nil {
		t.Fatalf("expected nil for unknown user, got %+v", u2)
	}
}

func TestMaxItemAndUpdates(t *testing.T) {
	c := newClient(t)
	m, err := c.MaxItem(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if m <= 0 {
		t.Errorf("unexpected maxitem %d", m)
	}
	u, err := c.Updates(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(u.Items) == 0 {
		t.Error("expected non-empty updates.items")
	}
}

func TestStoryIDLists(t *testing.T) {
	c := newClient(t)
	ctx := context.Background()
	for _, fetch := range []func(context.Context) ([]int64, error){
		c.TopStoryIDs, c.NewStoryIDs, c.BestStoryIDs, c.AskStoryIDs, c.ShowStoryIDs, c.JobStoryIDs,
	} {
		if _, err := fetch(ctx); err != nil {
			t.Errorf("ids fetch: %v", err)
		}
	}
	show, _ := c.ShowStoryIDs(ctx)
	if len(show) != 0 {
		t.Errorf("expected show = [], got %v", show)
	}
}

func TestTopStoriesHydration(t *testing.T) {
	c := newClient(t)
	out, err := c.TopStories(context.Background(), 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) > 3 {
		t.Errorf("got %d, want <= 3", len(out))
	}
}

func TestCommentTreePrunesDeleted(t *testing.T) {
	c := newClient(t)
	root, err := c.CommentTree(context.Background(), 8000)
	if err != nil {
		t.Fatal(err)
	}
	if root == nil || len(root.Replies) != 2 {
		t.Fatalf("unexpected root shape: %+v", root)
	}
	c1, c2 := root.Replies[0], root.Replies[1]
	if len(c1.Replies) != 1 || c1.Replies[0].IDField != 8003 {
		t.Errorf("c1 replies: %+v", c1.Replies)
	}
	if len(c2.Replies) != 1 || c2.Replies[0].IDField != 8005 {
		t.Errorf("c2 replies: %+v", c2.Replies)
	}
}

func TestHTTP500Propagates(t *testing.T) {
	c := newClient(t)
	_, err := c.Item(context.Background(), 99999999)
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 500 {
		t.Fatalf("expected HTTPError 500, got %v", err)
	}
}

func TestTimeout(t *testing.T) {
	c := New(Options{BaseURL: mockBase, Timeout: 30 * time.Millisecond})
	_, err := c.Item(context.Background(), 99999998)
	if err == nil || !errors.Is(err, ErrTimeout) {
		t.Fatalf("expected ErrTimeout, got %v", err)
	}
}

func TestUnknownPath404(t *testing.T) {
	c := newClient(t)
	_, err := c.User(context.Background(), "../nonexistent-endpoint")
	var he *HTTPError
	if !errors.As(err, &he) || he.Status != 404 {
		t.Fatalf("expected HTTPError 404, got %v", err)
	}
}
