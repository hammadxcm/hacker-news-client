"""Synchronous client for the Hacker News Firebase API.

Uses the stdlib :mod:`urllib.request` for transport and
:class:`concurrent.futures.ThreadPoolExecutor` for bounded-concurrency batch
operations. Fails fast on HTTP or transport errors mid-batch.
"""

from __future__ import annotations

import builtins
import json
import os
import socket
import threading
import urllib.error
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

from .errors import HttpError, JsonError, TimeoutError, TransportError
from .types import (
    CommentTreeNode,
    Item,
    Updates,
    User,
    item_from_dict,
    user_from_dict,
)

DEFAULT_BASE_URL = "https://hacker-news.firebaseio.com/v0"
DEFAULT_TIMEOUT_S = 10.0
DEFAULT_CONCURRENCY = 10
DEFAULT_USER_AGENT = "hn-client-python/0.1.0"
DEFAULT_STORIES_LIMIT = 30


class HackerNewsClient:
    """Client for the official Hacker News Firebase API.

    All fetch methods return typed dataclasses. ``None`` responses — including
    ``{"deleted": true}`` tombstones — surface as ``None``. HTTP errors,
    timeouts, and transport failures raise subclasses of
    :class:`HackerNewsError`.

    Args:
        base_url: Overrides the API root (defaults to the env var ``HN_BASE``
            if set, else the official Firebase URL).
        timeout: Per-request budget in seconds.
        concurrency: Max in-flight requests for batch calls.
        user_agent: ``User-Agent`` header value.
        opener: Optional :class:`urllib.request.OpenerDirector` for transport
            injection (test doubles / middleware).

    Example:
        >>> client = HackerNewsClient()
        >>> item = client.item(1)
        >>> item.title if item else None
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_S,
        concurrency: int = DEFAULT_CONCURRENCY,
        user_agent: str = DEFAULT_USER_AGENT,
        opener: urllib.request.OpenerDirector | None = None,
    ) -> None:
        self.base_url = (base_url or os.environ.get("HN_BASE") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.concurrency = concurrency
        self.user_agent = user_agent
        self._opener = opener or urllib.request.build_opener()

    # ------------------------------------------------------------------ transport

    def _get(self, path: str) -> object:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        try:
            with self._opener.open(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as err:
            status = err.code
            err.close()
            raise HttpError(f"hn: http {status}", url=url, status=status) from err
        except urllib.error.URLError as err:
            reason = getattr(err, "reason", None)
            if isinstance(reason, (socket.timeout, TimeoutError)):
                raise TimeoutError("hn: timeout", url=url) from err
            raise TransportError("hn: transport failure", url=url) from err
        except builtins.TimeoutError as err:
            raise TimeoutError("hn: timeout", url=url) from err
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as err:
            raise JsonError("hn: invalid json", url=url) from err

    # ------------------------------------------------------------------ items

    def item(self, id: int | str) -> Item | None:
        """Fetch a single item. Returns ``None`` for unknown ids and deleted stubs."""
        body = self._get(f"/item/{id}.json")
        if body is None:
            return None
        if isinstance(body, dict) and body.get("deleted") is True:
            return None
        if not isinstance(body, dict):
            raise JsonError(f"hn: unexpected item shape: {type(body).__name__}")
        return item_from_dict(body)

    def items(self, ids: list[int | str]) -> list[Item]:
        """Batch-fetch items with bounded concurrency.

        Drops ``None`` entries; surviving items preserve relative input order.
        Fails fast on the first HTTP / transport error, raising that error and
        discarding any partial results.

        Args:
            ids: Item ids to fetch, in desired output order.

        Returns:
            Surviving items, in input order.

        Example:
            >>> items = client.items([1, 2, 3])
        """
        if not ids:
            return []
        results: dict[int, Item | None] = {}
        first_error: list[BaseException] = []
        lock = threading.Lock()

        def worker(idx: int, item_id: int | str) -> None:
            if first_error:
                return
            try:
                results[idx] = self.item(item_id)
            except BaseException as exc:  # noqa: BLE001
                with lock:
                    if not first_error:
                        first_error.append(exc)

        with ThreadPoolExecutor(max_workers=self.concurrency) as exe:
            futures = [exe.submit(worker, i, id) for i, id in enumerate(ids)]
            for fut in as_completed(futures):
                fut.result()  # propagate unexpected exceptions
                if first_error:
                    for f in futures:
                        f.cancel()
                    break

        if first_error:
            raise first_error[0]
        return [results[i] for i in range(len(ids)) if results.get(i) is not None]  # type: ignore[misc]

    # ------------------------------------------------------------------ user, scalars, lists

    def user(self, username: str) -> User | None:
        """Fetch a user profile; ``None`` if unknown."""
        body = self._get(f"/user/{username}.json")
        if body is None:
            return None
        if not isinstance(body, dict):
            raise JsonError("hn: unexpected user shape")
        return user_from_dict(body)

    def max_item(self) -> int:
        """Return the current largest item id."""
        val = self._get("/maxitem.json")
        if not isinstance(val, int):
            raise JsonError("hn: maxitem expected int")
        return val

    def updates(self) -> Updates:
        """Return the ``/updates`` record."""
        body = self._get("/updates.json")
        if not isinstance(body, dict):
            raise JsonError("hn: updates expected object")
        return Updates(items=tuple(body.get("items", [])), profiles=tuple(body.get("profiles", [])))

    def _ids(self, path: str) -> list[int]:
        body = self._get(path)
        if not isinstance(body, list):
            raise JsonError(f"hn: {path} expected array")
        return list(body)

    def top_story_ids(self) -> list[int]:
        return self._ids("/topstories.json")

    def new_story_ids(self) -> list[int]:
        return self._ids("/newstories.json")

    def best_story_ids(self) -> list[int]:
        return self._ids("/beststories.json")

    def ask_story_ids(self) -> list[int]:
        return self._ids("/askstories.json")

    def show_story_ids(self) -> list[int]:
        return self._ids("/showstories.json")

    def job_story_ids(self) -> list[int]:
        return self._ids("/jobstories.json")

    def _hydrate(self, fetcher: Callable[[], list[int]], limit: int) -> list[Item]:
        return self.items(fetcher()[:limit])  # type: ignore[arg-type]

    def top_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.top_story_ids, limit)

    def new_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.new_story_ids, limit)

    def best_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.best_story_ids, limit)

    def ask_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.ask_story_ids, limit)

    def show_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.show_story_ids, limit)

    def job_stories(self, limit: int = DEFAULT_STORIES_LIMIT) -> list[Item]:
        return self._hydrate(self.job_story_ids, limit)

    # ------------------------------------------------------------------ comment tree

    def comment_tree(self, id: int | str) -> CommentTreeNode | None:
        """Recursively fetch a comment tree rooted at ``id``.

        Uses one global :class:`threading.Semaphore` bounded by
        ``self.concurrency`` across the whole recursion so fan-out × depth
        cannot amplify load. Deleted nodes are pruned. Fails fast.

        Example:
            >>> tree = client.comment_tree(8000)
        """
        sem = threading.Semaphore(self.concurrency)

        def visit(node_id: int | str) -> CommentTreeNode | None:
            with sem:
                body = self._get(f"/item/{node_id}.json")
            if body is None or (isinstance(body, dict) and body.get("deleted") is True):
                return None
            if not isinstance(body, dict):
                raise JsonError("hn: unexpected item shape")
            kids = body.get("kids", []) or []
            children: list[CommentTreeNode] = []
            if kids:
                with ThreadPoolExecutor(max_workers=min(self.concurrency, len(kids))) as exe:
                    for child in exe.map(visit, kids):
                        if child is not None:
                            children.append(child)
            # Best-effort Comment construction regardless of whether this node's
            # `type` is comment/story/etc. — consumers typically only call this
            # for a story root, whose own top-level shape we don't need to
            # preserve here (only the tree under it).
            return CommentTreeNode(
                id=body["id"],
                replies=tuple(children),
                by=body.get("by"),
                time=body.get("time"),
                parent=body.get("parent"),
                text=body.get("text"),
                kids=tuple(kids),
                dead=bool(body.get("dead", False)),
            )

        return visit(id)
