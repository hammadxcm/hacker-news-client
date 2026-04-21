package hackernews

import (
	"encoding/json"
	"fmt"
)

// Item is the sum-type interface implemented by every item variant
// (Story, Comment, Job, Poll, PollOpt). The unexported isItem method seals
// the interface so outside packages can't add variants.
//
// Callers use a type switch to narrow:
//
//	switch it := item.(type) {
//	case Story:  // it.Title, it.Score
//	case Comment:  // it.Text, it.Parent
//	}
type Item interface {
	isItem()
	ID() int64
	Kind() string
}

// Base carries the fields common to every item variant.
type Base struct {
	IDField   int64  `json:"id"`
	TypeField string `json:"type"`
	By        string `json:"by,omitempty"`
	Time      int64  `json:"time,omitempty"`
	Dead      bool   `json:"dead,omitempty"`
}

// ID returns the item's integer identifier.
func (b Base) ID() int64 { return b.IDField }

// Kind returns the item's type string (one of story / comment / job / poll / pollopt).
func (b Base) Kind() string { return b.TypeField }

// Story is a submitted HN story.
type Story struct {
	Base
	Title       string  `json:"title,omitempty"`
	Score       int64   `json:"score,omitempty"`
	Descendants int64   `json:"descendants,omitempty"`
	URL         string  `json:"url,omitempty"`
	Text        string  `json:"text,omitempty"`
	Kids        []int64 `json:"kids,omitempty"`
}

func (Story) isItem() {}

// Comment is a comment on a story, poll, or parent comment.
type Comment struct {
	Base
	Parent int64   `json:"parent,omitempty"`
	Text   string  `json:"text,omitempty"`
	Kids   []int64 `json:"kids,omitempty"`
}

func (Comment) isItem() {}

// Job is a YC-posted job listing.
type Job struct {
	Base
	Title string `json:"title,omitempty"`
	Score int64  `json:"score,omitempty"`
	URL   string `json:"url,omitempty"`
	Text  string `json:"text,omitempty"`
}

func (Job) isItem() {}

// Poll is a multiple-choice poll. Parts are pollopt ids in display order.
type Poll struct {
	Base
	Title       string  `json:"title,omitempty"`
	Score       int64   `json:"score,omitempty"`
	Descendants int64   `json:"descendants,omitempty"`
	Parts       []int64 `json:"parts"`
	Text        string  `json:"text,omitempty"`
	Kids        []int64 `json:"kids,omitempty"`
}

func (Poll) isItem() {}

// PollOpt is one option under a Poll. Poll is the parent poll's id.
type PollOpt struct {
	Base
	Poll  int64  `json:"poll"`
	Score int64  `json:"score,omitempty"`
	Text  string `json:"text,omitempty"`
}

func (PollOpt) isItem() {}

// User is a HN user profile.
type User struct {
	ID        string  `json:"id"`
	Created   int64   `json:"created"`
	Karma     int64   `json:"karma"`
	About     string  `json:"about,omitempty"`
	Submitted []int64 `json:"submitted,omitempty"`
}

// Updates is the /updates endpoint response.
type Updates struct {
	Items    []int64  `json:"items"`
	Profiles []string `json:"profiles"`
}

// CommentTreeNode is a recursively-fetched comment tree node.
type CommentTreeNode struct {
	Comment
	Replies []*CommentTreeNode `json:"replies"`
}

// decodeItem peeks at the "type" field and dispatches to the concrete variant.
// Returns (nil, nil) for the literal JSON "null" or for {"deleted":true} stubs
// — both semantically mean "no item" per the DESIGN contract.
func decodeItem(data []byte) (Item, error) {
	trimmed := trimJSON(data)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil, nil
	}
	var peek struct {
		Type    string `json:"type"`
		Deleted bool   `json:"deleted"`
	}
	if err := json.Unmarshal(data, &peek); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDecode, err)
	}
	if peek.Deleted {
		return nil, nil
	}
	switch peek.Type {
	case "story":
		var v Story
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecode, err)
		}
		return v, nil
	case "comment":
		var v Comment
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecode, err)
		}
		return v, nil
	case "job":
		var v Job
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecode, err)
		}
		return v, nil
	case "poll":
		var v Poll
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecode, err)
		}
		return v, nil
	case "pollopt":
		var v PollOpt
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDecode, err)
		}
		return v, nil
	default:
		return nil, fmt.Errorf("%w: unknown item type %q", ErrDecode, peek.Type)
	}
}

func trimJSON(b []byte) []byte {
	for len(b) > 0 && (b[0] == ' ' || b[0] == '\t' || b[0] == '\r' || b[0] == '\n') {
		b = b[1:]
	}
	for len(b) > 0 && (b[len(b)-1] == ' ' || b[len(b)-1] == '\t' || b[len(b)-1] == '\r' || b[len(b)-1] == '\n') {
		b = b[:len(b)-1]
	}
	return b
}
