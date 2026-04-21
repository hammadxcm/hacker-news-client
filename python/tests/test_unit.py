"""Pure unit tests — mock :mod:`urllib` transport via a fake opener.

No network, no subprocess. Exercises decode, error-mapping, batch concurrency,
and comment_tree logic in isolation.
"""

from __future__ import annotations

import io
import json
import socket
import sys
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from hacker_news_client import (  # noqa: E402
    Comment,
    CommentTreeNode,
    HackerNewsClient,
    HackerNewsError,
    HttpError,
    Job,
    JsonError,
    Poll,
    PollOpt,
    Story,
    TransportError,
    Updates,
    User,
    item_from_dict,
    user_from_dict,
)
from hacker_news_client import (  # noqa: E402
    TimeoutError as HnTimeoutError,
)


class FakeResponse:
    """Minimal object supporting the ``with opener.open(...) as resp:`` pattern."""

    def __init__(self, body: bytes, delay: float = 0.0) -> None:
        self._body = body
        self._delay = delay

    def __enter__(self) -> FakeResponse:
        if self._delay:
            time.sleep(self._delay)
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def fake_opener(routes: dict[str, object]) -> MagicMock:
    """Build a MagicMock opener whose ``open(req, timeout=)`` dispatches on URL.

    Each route value is one of:
      * bytes / str (returned as 200 body)
      * dict / list / int / None (JSON-encoded and returned 200)
      * urllib.error.HTTPError / URLError / OSError instance (raised)
      * callable(url, timeout) -> FakeResponse (advanced)
    """
    mock = MagicMock()

    sentinel = object()

    def open_impl(req: urllib.request.Request, timeout: float = 10.0) -> FakeResponse:
        url = req.full_url
        spec = routes.get(url, sentinel)
        if spec is sentinel:
            spec = routes.get("*", sentinel)
        if spec is sentinel:
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, io.BytesIO(b""))
        if isinstance(spec, BaseException):
            raise spec
        if callable(spec):
            return spec(url, timeout)
        if isinstance(spec, bytes):
            return FakeResponse(spec)
        if isinstance(spec, str):
            return FakeResponse(spec.encode("utf-8"))
        # None → literal JSON null body; dict/list/int → json-encode
        return FakeResponse(json.dumps(spec).encode("utf-8"))

    mock.open.side_effect = open_impl
    return mock


STORY_1 = {
    "by": "pg",
    "descendants": 3,
    "id": 1,
    "kids": [15],
    "score": 57,
    "time": 1160418111,
    "title": "Y Combinator",
    "type": "story",
    "url": "http://ycombinator.com",
}

BASE = "http://mock/v0"


class ConstructorTests(unittest.TestCase):
    def test_defaults(self) -> None:
        c = HackerNewsClient()
        self.assertTrue(c.base_url.startswith("https://hacker-news.firebaseio.com/v0"))
        self.assertEqual(c.timeout, 10.0)
        self.assertEqual(c.concurrency, 10)
        self.assertTrue(c.user_agent.startswith("hn-client-python/"))

    def test_base_url_trailing_slash(self) -> None:
        c = HackerNewsClient(base_url="http://x/v0///")
        self.assertEqual(c.base_url, "http://x/v0")

    def test_hn_base_env(self) -> None:
        import os

        prev = os.environ.get("HN_BASE")
        os.environ["HN_BASE"] = "http://env.test/v0"
        try:
            self.assertEqual(HackerNewsClient().base_url, "http://env.test/v0")
        finally:
            if prev is None:
                del os.environ["HN_BASE"]
            else:
                os.environ["HN_BASE"] = prev


class ItemDecodeTests(unittest.TestCase):
    def test_story(self) -> None:
        opener = fake_opener({f"{BASE}/item/1.json": STORY_1})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        item = c.item(1)
        self.assertIsInstance(item, Story)

    def test_every_variant(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/item/1.json": {
                    "id": 1,
                    "type": "comment",
                    "time": 1,
                    "text": "hi",
                    "parent": 0,
                },
                f"{BASE}/item/2.json": {"id": 2, "type": "job", "time": 1, "title": "x", "score": 1},
                f"{BASE}/item/3.json": {
                    "id": 3,
                    "type": "poll",
                    "time": 1,
                    "score": 1,
                    "parts": [10, 11],
                },
                f"{BASE}/item/4.json": {"id": 4, "type": "pollopt", "time": 1, "poll": 3, "score": 1},
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener)
        self.assertIsInstance(c.item(1), Comment)
        self.assertIsInstance(c.item(2), Job)
        self.assertIsInstance(c.item(3), Poll)
        self.assertIsInstance(c.item(4), PollOpt)

    def test_null_body(self) -> None:
        opener = fake_opener({f"{BASE}/item/0.json": None})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        self.assertIsNone(c.item(0))

    def test_deleted_stub(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/item/9.json": {
                    "id": 9,
                    "type": "comment",
                    "deleted": True,
                    "time": 1,
                }
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener)
        self.assertIsNone(c.item(9))

    def test_item_from_dict_unknown_type(self) -> None:
        with self.assertRaises(ValueError):
            item_from_dict({"type": "unknown", "id": 1})

    def test_user_from_dict_with_and_without_submitted(self) -> None:
        u1 = user_from_dict({"id": "a", "created": 1, "karma": 1, "submitted": [1, 2]})
        u2 = user_from_dict({"id": "b", "created": 2, "karma": 2})
        self.assertEqual(u1.submitted, (1, 2))
        self.assertEqual(u2.submitted, ())


class ErrorMappingTests(unittest.TestCase):
    def _client_raising(self, exc: BaseException) -> HackerNewsClient:
        opener = fake_opener({f"{BASE}/item/1.json": exc})
        return HackerNewsClient(base_url=BASE, opener=opener)

    def test_http_500(self) -> None:
        c = self._client_raising(
            urllib.error.HTTPError(f"{BASE}/item/1.json", 500, "boom", {}, io.BytesIO(b"{}"))
        )
        with self.assertRaises(HttpError) as ctx:
            c.item(1)
        self.assertEqual(ctx.exception.status, 500)
        self.assertTrue(isinstance(ctx.exception, HackerNewsError))

    def test_http_404_not_conflated_with_null(self) -> None:
        c = self._client_raising(
            urllib.error.HTTPError(f"{BASE}/item/1.json", 404, "nf", {}, io.BytesIO(b""))
        )
        with self.assertRaises(HttpError) as ctx:
            c.item(1)
        self.assertEqual(ctx.exception.status, 404)

    def test_timeout_via_socket(self) -> None:
        c = self._client_raising(socket.timeout("timed out"))
        with self.assertRaises(HnTimeoutError):
            c.item(1)

    def test_timeout_via_builtin(self) -> None:
        c = self._client_raising(TimeoutError("py-builtin-timeout"))
        with self.assertRaises(HnTimeoutError):
            c.item(1)

    def test_timeout_via_urlerror_wrapping_socket_timeout(self) -> None:
        c = self._client_raising(urllib.error.URLError(socket.timeout("t")))
        with self.assertRaises(HnTimeoutError):
            c.item(1)

    def test_transport_failure(self) -> None:
        c = self._client_raising(urllib.error.URLError("dns fail"))
        with self.assertRaises(TransportError):
            c.item(1)

    def test_invalid_json(self) -> None:
        opener = fake_opener({f"{BASE}/item/1.json": b"not-json"})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.item(1)

    def test_unexpected_item_shape_not_dict(self) -> None:
        # Server returns a JSON number where we expect an item object.
        opener = fake_opener({f"{BASE}/item/1.json": 42})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.item(1)

    def test_unexpected_user_shape(self) -> None:
        opener = fake_opener({f"{BASE}/user/foo.json": 42})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.user("foo")

    def test_maxitem_wrong_shape(self) -> None:
        # Valid JSON (a string) but wrong runtime type → JsonError.
        opener = fake_opener({f"{BASE}/maxitem.json": b'"not a number"'})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.max_item()

    def test_updates_wrong_shape(self) -> None:
        # Valid JSON array where we expect an object → JsonError.
        opener = fake_opener({f"{BASE}/updates.json": b"[1, 2, 3]"})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.updates()

    def test_idlist_wrong_shape(self) -> None:
        # Valid JSON string where we expect an array → JsonError.
        opener = fake_opener({f"{BASE}/topstories.json": b'"nope"'})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.top_story_ids()


class BatchAndHydrateTests(unittest.TestCase):
    def test_items_order_and_null_drop(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/item/1.json": STORY_1,
                f"{BASE}/item/2.json": None,
                f"{BASE}/item/3.json": {**STORY_1, "id": 3},
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener, concurrency=3)
        out = c.items([1, 2, 3])
        self.assertEqual([i.id for i in out], [1, 3])

    def test_items_empty(self) -> None:
        opener = MagicMock()
        c = HackerNewsClient(base_url=BASE, opener=opener, concurrency=3)
        self.assertEqual(c.items([]), [])
        opener.open.assert_not_called()

    def test_items_fail_fast(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/item/1.json": STORY_1,
                f"{BASE}/item/99.json": urllib.error.HTTPError(
                    f"{BASE}/item/99.json", 500, "boom", {}, io.BytesIO(b"")
                ),
                f"{BASE}/item/2.json": STORY_1,
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener, concurrency=2)
        with self.assertRaises(HttpError):
            c.items([1, 99, 2])


    def test_scalars_and_every_list_plus_hydration(self) -> None:
        routes: dict[str, object] = {
            f"{BASE}/maxitem.json": 123,
            f"{BASE}/updates.json": {"items": [1], "profiles": ["pg"]},
            f"{BASE}/topstories.json": [1],
            f"{BASE}/newstories.json": [1],
            f"{BASE}/beststories.json": [],
            f"{BASE}/askstories.json": [],
            f"{BASE}/showstories.json": [],
            f"{BASE}/jobstories.json": [],
            f"{BASE}/item/1.json": STORY_1,
        }
        opener = fake_opener(routes)
        c = HackerNewsClient(base_url=BASE, opener=opener)
        self.assertEqual(c.max_item(), 123)
        up = c.updates()
        self.assertIsInstance(up, Updates)
        self.assertEqual(up.items, (1,))
        self.assertEqual(c.top_story_ids(), [1])
        self.assertEqual(c.new_story_ids(), [1])
        self.assertEqual(c.best_story_ids(), [])
        self.assertEqual(c.ask_story_ids(), [])
        self.assertEqual(c.show_story_ids(), [])
        self.assertEqual(c.job_story_ids(), [])
        self.assertEqual(len(c.top_stories(5)), 1)
        self.assertEqual(len(c.new_stories(5)), 1)
        self.assertEqual(c.best_stories(5), [])
        self.assertEqual(c.ask_stories(5), [])
        self.assertEqual(c.show_stories(5), [])
        self.assertEqual(c.job_stories(5), [])

    def test_user_known_and_unknown(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/user/pg.json": {
                    "id": "pg",
                    "created": 1,
                    "karma": 100,
                    "submitted": [1, 2],
                },
                f"{BASE}/user/nobody.json": None,
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener)
        pg = c.user("pg")
        self.assertIsInstance(pg, User)
        self.assertIsNone(c.user("nobody"))


class CommentTreeTests(unittest.TestCase):
    def test_prunes_deleted_and_null_kids(self) -> None:
        opener = fake_opener(
            {
                f"{BASE}/item/100.json": {
                    "id": 100,
                    "type": "comment",
                    "time": 1,
                    "kids": [101, 102, 103],
                },
                f"{BASE}/item/101.json": {"id": 101, "type": "comment", "time": 1},
                f"{BASE}/item/102.json": {
                    "id": 102,
                    "type": "comment",
                    "deleted": True,
                    "time": 1,
                },
                f"{BASE}/item/103.json": None,
            }
        )
        c = HackerNewsClient(base_url=BASE, opener=opener, concurrency=2)
        root = c.comment_tree(100)
        self.assertIsInstance(root, CommentTreeNode)
        assert root is not None
        self.assertEqual([r.id for r in root.replies], [101])

    def test_null_root(self) -> None:
        opener = fake_opener({f"{BASE}/item/999.json": None})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        self.assertIsNone(c.comment_tree(999))

    def test_unexpected_root_shape_raises(self) -> None:
        opener = fake_opener({f"{BASE}/item/1.json": 42})
        c = HackerNewsClient(base_url=BASE, opener=opener)
        with self.assertRaises(JsonError):
            c.comment_tree(1)


if __name__ == "__main__":
    unittest.main()
