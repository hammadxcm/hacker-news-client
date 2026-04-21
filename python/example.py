#!/usr/bin/env python3
"""Runnable example hitting the live Hacker News API.

Run::

    python example.py
"""

from __future__ import annotations

from hacker_news_client import HackerNewsClient, Story


def main() -> None:
    client = HackerNewsClient()
    top = client.top_stories(5)
    for item in top:
        if isinstance(item, Story):
            print(f"• {item.title} — {item.by} ({item.score} points)")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "src")
    main()
