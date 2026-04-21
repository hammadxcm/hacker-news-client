"""Zero-dep Hacker News Firebase API client.

Example:
    >>> from hacker_news_client import HackerNewsClient
    >>> client = HackerNewsClient()
    >>> item = client.item(1)
"""

from .client import HackerNewsClient
from .errors import (
    HackerNewsError,
    HttpError,
    JsonError,
    TimeoutError,
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
    "HttpError",
    "JsonError",
    "TimeoutError",
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
