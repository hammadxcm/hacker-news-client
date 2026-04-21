// Runnable example hitting the live Hacker News API.
//
// Run: go run ./example
package main

import (
	"context"
	"fmt"
	"log"

	hackernews "github.com/hammadkhan/hacker-news-client/go"
)

func main() {
	c := hackernews.New(hackernews.Options{})
	top, err := c.TopStories(context.Background(), 5)
	if err != nil {
		log.Fatal(err)
	}
	for _, it := range top {
		if s, ok := it.(hackernews.Story); ok {
			fmt.Printf("• %s — %s (%d points)\n", s.Title, s.By, s.Score)
		}
	}
}
