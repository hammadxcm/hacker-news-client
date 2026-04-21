"""Typed item model for the Hacker News API.

Each of the five item variants is a frozen dataclass with a ``type`` literal
discriminator. The :data:`Item` type alias is their union; callers can narrow
with structural pattern matching::

    match item:
        case Story(title=t):
            ...
        case Comment(text=t):
            ...
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, TypeAlias


@dataclass(frozen=True)
class Story:
    """A submitted story. ``type`` is always ``"story"``."""

    id: int
    type: Literal["story"] = "story"
    by: str | None = None
    time: int | None = None
    title: str | None = None
    score: int | None = None
    descendants: int | None = None
    url: str | None = None
    text: str | None = None
    kids: tuple[int, ...] = field(default_factory=tuple)
    dead: bool = False


@dataclass(frozen=True)
class Comment:
    """A comment on a story, poll, or parent comment."""

    id: int
    type: Literal["comment"] = "comment"
    by: str | None = None
    time: int | None = None
    parent: int | None = None
    text: str | None = None
    kids: tuple[int, ...] = field(default_factory=tuple)
    dead: bool = False


@dataclass(frozen=True)
class Job:
    """A YC-posted job listing. ``type`` is always ``"job"``."""

    id: int
    type: Literal["job"] = "job"
    by: str | None = None
    time: int | None = None
    title: str | None = None
    score: int | None = None
    url: str | None = None
    text: str | None = None
    dead: bool = False


@dataclass(frozen=True)
class Poll:
    """A poll. ``parts`` lists the pollopt ids in display order."""

    id: int
    parts: tuple[int, ...]
    type: Literal["poll"] = "poll"
    by: str | None = None
    time: int | None = None
    title: str | None = None
    score: int | None = None
    descendants: int | None = None
    text: str | None = None
    kids: tuple[int, ...] = field(default_factory=tuple)
    dead: bool = False


@dataclass(frozen=True)
class PollOpt:
    """An option under a :class:`Poll`. ``poll`` points at its parent."""

    id: int
    poll: int
    type: Literal["pollopt"] = "pollopt"
    by: str | None = None
    time: int | None = None
    score: int | None = None
    text: str | None = None


Item: TypeAlias = Story | Comment | Job | Poll | PollOpt


@dataclass(frozen=True)
class User:
    """A Hacker News user profile."""

    id: str
    created: int
    karma: int
    about: str | None = None
    submitted: tuple[int, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Updates:
    """The ``/updates`` endpoint response."""

    items: tuple[int, ...]
    profiles: tuple[str, ...]


@dataclass(frozen=True)
class CommentTreeNode:
    """A :class:`Comment` with its recursively-fetched replies attached."""

    id: int
    replies: tuple[CommentTreeNode, ...]
    type: Literal["comment"] = "comment"
    by: str | None = None
    time: int | None = None
    parent: int | None = None
    text: str | None = None
    kids: tuple[int, ...] = field(default_factory=tuple)
    dead: bool = False


_VARIANTS: dict[str, type] = {
    "story": Story,
    "comment": Comment,
    "job": Job,
    "poll": Poll,
    "pollopt": PollOpt,
}


def item_from_dict(data: dict) -> Item:
    """Build the matching :data:`Item` variant from a decoded API payload.

    Unknown fields are silently discarded — the API contract says clients must
    ignore them. Tuples replace lists for ``kids`` / ``parts`` so item instances
    stay hashable and immutable.

    Args:
        data: The decoded JSON dictionary (as returned by the Firebase API).

    Returns:
        The matching variant instance.

    Raises:
        ValueError: if ``data["type"]`` is missing or unknown.
    """
    kind = data.get("type")
    cls = _VARIANTS.get(kind)
    if cls is None:
        raise ValueError(f"unknown item type: {kind!r}")
    kwargs = {}
    fields = {f for f in cls.__dataclass_fields__ if f != "type"}
    for name in fields:
        if name not in data:
            continue
        value = data[name]
        if name in ("kids", "parts", "submitted") and isinstance(value, list):
            value = tuple(value)
        kwargs[name] = value
    return cls(**kwargs)  # type: ignore[return-value]


def user_from_dict(data: dict) -> User:
    """Build a :class:`User` from a decoded API payload."""
    submitted = data.get("submitted")
    return User(
        id=data["id"],
        created=data["created"],
        karma=data["karma"],
        about=data.get("about"),
        submitted=tuple(submitted) if submitted else (),
    )
