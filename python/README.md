# hacker-news-client (Python)

[![PyPI version](https://img.shields.io/pypi/v/hacker-news-client.svg?style=flat-square&logo=pypi&logoColor=white)](https://pypi.org/project/hacker-news-client/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Python](https://img.shields.io/badge/python-%E2%89%A53.10-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![Typing](https://img.shields.io/badge/mypy-strict-0F4C81?style=flat-square)](./pyproject.toml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg?style=flat-square)](#tests)

Zero-dependency Python client for the [Hacker News Firebase API](https://github.com/HackerNews/API). Pure stdlib (`urllib.request` + `concurrent.futures.ThreadPoolExecutor`) with an optional `httpx` async extra. Frozen dataclasses for every item variant. Ships a `py.typed` marker for strict mypy consumers. Part of the [cross-language `hacker-news-client` suite](../README.md).

## Install

```bash
pip install hacker-news-client
```

Async extras (reserved for future `httpx`-based implementation):

```bash
pip install 'hacker-news-client[async]'
```

## Usage

```python
from hacker_news_client import HackerNewsClient, Story, Comment

client = HackerNewsClient()

# Single item
item = client.item(1)

# Structural pattern matching (Python 3.10+)
match item:
    case Story(title=t, by=b, score=s):
        print(f"{t} — {b} ({s})")
    case Comment(text=t, parent=p):
        print(f"comment on {p}: {t[:50]}")
    case None:
        print("deleted or missing")

# Batch with bounded concurrency, fail-fast
items = client.items([1, 15, 100])

# Top stories, hydrated
top = client.top_stories(limit=10)

# Recursive comment tree
tree = client.comment_tree(8863)

# User profile
user = client.user("pg")
```

## Configuration

```python
HackerNewsClient(
    base_url="https://hacker-news.firebaseio.com/v0",  # default
    timeout=10.0,                                        # seconds
    concurrency=10,                                      # batch fan-out cap
    user_agent="my-app/1.0",
    opener=custom_opener,                                # urllib OpenerDirector — injectable
)
```

The `opener` parameter accepts any `urllib.request.OpenerDirector`-compatible object, which makes unit tests straightforward (see [`tests/test_unit.py`](./tests/test_unit.py)).

## Error handling

```python
from hacker_news_client import (
    HackerNewsError,
    HttpError,
    TimeoutError,
    JsonError,
    TransportError,
)

try:
    client.item(1)
except HttpError as err:
    print(f"HTTP {err.status} at {err.url}")
except TimeoutError:
    print("timed out")
except TransportError as err:
    print(f"network failure: {err.__cause__}")
except JsonError:
    print("invalid JSON")
except HackerNewsError as err:
    print(f"hn error: {err}")
```

`None` from `item()` / `user()` means the API returned `null` — not an error. Deleted stubs also surface as `None`.

## Item variants

Every variant is a frozen dataclass:

```python
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class Story:
    id: int
    type: Literal["story"]
    time: int | None
    title: str | None
    url: str | None
    score: int | None
    descendants: int | None
    text: str | None
    by: str | None
    kids: tuple[int, ...]
    dead: bool
```

Sibling variants: `Comment`, `Job`, `Poll`, `PollOpt`. The `Item` type alias is their union.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md). Methods are `snake_case`:

| Method | Returns |
|---|---|
| `item(id)` | `Item \| None` |
| `items(ids)` | `list[Item]` — order-preserving, None dropped |
| `user(username)` | `User \| None` |
| `max_item()` | `int` |
| `updates()` | `Updates` (named tuple) |
| `top_story_ids()` / `new_story_ids()` / `best_story_ids()` / `ask_story_ids()` / `show_story_ids()` / `job_story_ids()` | `list[int]` |
| `top_stories(limit=30)` / ... | hydrated `list[Item]` |
| `comment_tree(id)` | `CommentTreeNode \| None` |

## Tests

```bash
cd python
python3 -m unittest discover tests    # 45 tests: 16 integration + 29 unit
ruff check src tests                    # lint
mypy --strict src                       # type check (requires dev extras)
```

Coverage: 100% (260 statements, 0 missed) via [coverage.py](https://coverage.readthedocs.io).

## Example

[`example.py`](./example.py) hits the live HN API:

```bash
python3 example.py
```

## Links

- [Main repo README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [CONTRIBUTING](../CONTRIBUTING.md)
- [DESIGN.md](../DESIGN.md)

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
