"""Zero-dep Hacker News Firebase API client.

Example:
    >>> from hacker_news_client import HackerNewsClient
    >>> client = HackerNewsClient()
    >>> item = client.item(1)
"""

from .client import HackerNewsClient
from .errors import (
    HackerNewsError,
    HnTimeoutError,
    HttpError,
    JsonError,
    TimeoutError,  # back-compat alias; deprecated in favor of HnTimeoutError
    TransportError,
)
from .types import (
    Comment,
    CommentTreeNode,
    Item,
    Job,
    Poll,
    PollOpt,
    Story,
    Updates,
    User,
    item_from_dict,
    user_from_dict,
)

__version__ = "0.1.0"

__all__ = [
    "HackerNewsClient",
    "HackerNewsError",
    "HnTimeoutError",
    "HttpError",
    "JsonError",
    "TimeoutError",  # deprecated alias; new code should use HnTimeoutError
    "TransportError",
    "Item",
    "Story",
    "Comment",
    "Job",
    "Poll",
    "PollOpt",
    "User",
    "Updates",
    "CommentTreeNode",
    "item_from_dict",
    "user_from_dict",
]
