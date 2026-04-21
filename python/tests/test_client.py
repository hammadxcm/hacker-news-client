"""Integration tests for :class:`HackerNewsClient` against the shared mock server.

The mock server is launched once via ``node test/mock-server.js``; its port is
piped back on stdout.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import unittest
import urllib.request
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent  # python/tests/
PY_ROOT = TEST_DIR.parent  # python/
ROOT = PY_ROOT.parent  # repo root
sys.path.insert(0, str(PY_ROOT / "src"))

from hacker_news_client import (  # noqa: E402
    Comment,
    HackerNewsClient,
    HttpError,
    Job,
    Poll,
    PollOpt,
    Story,
    TimeoutError as HnTimeoutError,
)


def _start_mock() -> tuple[subprocess.Popen, str]:
    env = os.environ.copy()
    env["MOCK_PORT"] = "0"
    env["MOCK_SLOW_MS"] = "100"
    proc = subprocess.Popen(
        ["node", str(ROOT / "test" / "mock-server.js")],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        text=True,
        bufsize=1,
    )
    line = proc.stdout.readline().strip()  # type: ignore[union-attr]
    # expected: "mock-server listening on http://localhost:<port>/v0"
    base = line.split(" on ", 1)[1]
    # readiness probe
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{base}/maxitem.json", timeout=0.5).read()
            break
        except Exception:
            time.sleep(0.05)
    return proc, base


class HackerNewsClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.proc, cls.base = _start_mock()
        cls.client = HackerNewsClient(base_url=cls.base)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
        if cls.proc.stdout is not None:
            cls.proc.stdout.close()

    def test_item_story(self) -> None:
        item = self.client.item(1)
        self.assertIsInstance(item, Story)
        assert isinstance(item, Story)
        self.assertEqual(item.by, "pg")
        self.assertEqual(item.title, "Y Combinator")

    def test_item_each_variant(self) -> None:
        self.assertIsInstance(self.client.item(8001), Comment)
        self.assertIsInstance(self.client.item(192327), Job)
        self.assertIsInstance(self.client.item(126809), Poll)
        self.assertIsInstance(self.client.item(126810), PollOpt)

    def test_item_null(self) -> None:
        self.assertIsNone(self.client.item("null"))

    def test_item_deleted_stub(self) -> None:
        self.assertIsNone(self.client.item(8004))

    def test_item_dead(self) -> None:
        item = self.client.item("dead")
        self.assertIsNotNone(item)
        assert item is not None
        self.assertTrue(item.dead)

    def test_items_preserves_order_drops_nulls(self) -> None:
        out = self.client.items([1, "null", 8001, 8004, 192327])
        self.assertEqual([i.id for i in out], [1, 8001, 192327])

    def test_items_fail_fast_http_500(self) -> None:
        with self.assertRaises(HttpError):
            self.client.items([1, "inject-500-42", 8001])

    def test_items_empty(self) -> None:
        self.assertEqual(self.client.items([]), [])

    def test_user_known_and_unknown(self) -> None:
        pg = self.client.user("pg")
        self.assertIsNotNone(pg)
        assert pg is not None
        self.assertEqual(pg.id, "pg")
        self.assertIsNone(self.client.user("nobody"))

    def test_max_item_and_updates(self) -> None:
        self.assertIsInstance(self.client.max_item(), int)
        up = self.client.updates()
        self.assertGreater(len(up.items), 0)

    def test_every_story_ids_returns_list(self) -> None:
        self.assertIsInstance(self.client.top_story_ids(), list)
        self.assertEqual(self.client.show_story_ids(), [])

    def test_top_stories_hydration(self) -> None:
        out = self.client.top_stories(3)
        self.assertLessEqual(len(out), 3)

    def test_comment_tree_prunes_deleted(self) -> None:
        root = self.client.comment_tree(8000)
        self.assertIsNotNone(root)
        assert root is not None
        self.assertEqual(len(root.replies), 2)
        c1, c2 = root.replies
        self.assertEqual([r.id for r in c1.replies], [8003])
        self.assertEqual([r.id for r in c2.replies], [8005])

    def test_http_500_propagates(self) -> None:
        with self.assertRaises(HttpError):
            self.client.item("inject-500-42")

    def test_timeout_surfaces(self) -> None:
        fast = HackerNewsClient(base_url=self.base, timeout=0.03)
        with self.assertRaises(HnTimeoutError):
            fast.item("slow1")

    def test_unknown_path_raises_http_error(self) -> None:
        # User names with "/" are disallowed but we use the escape route to hit 404.
        with self.assertRaises(HttpError) as ctx:
            self.client.user("../nonexistent-endpoint")
        self.assertEqual(ctx.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
