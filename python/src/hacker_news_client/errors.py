"""Error hierarchy for the Hacker News client.

All errors raised by the client are subclasses of :class:`HackerNewsError`,
carrying the offending URL (if any), HTTP status (if any), and an optional
underlying ``__cause__``.
"""

from __future__ import annotations


class HackerNewsError(Exception):
    """Base class for every error surfaced by :class:`HackerNewsClient`.

    Args:
        message: Human-readable message.
        url: Request URL the error relates to, if any.
        status: HTTP status code, if applicable.

    Example:
        >>> try:
        ...     client.item(1)
        ... except HackerNewsError as err:
        ...     print(err.url, err.__cause__)
    """

    def __init__(
        self,
        message: str,
        *,
        url: str | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.url = url
        self.status = status


class TimeoutError(HackerNewsError):  # noqa: A001  -- shadows builtin by design
    """Request exceeded the client's total timeout."""


class HttpError(HackerNewsError):
    """Server returned a non-2xx status. ``status`` is always set."""


class JsonError(HackerNewsError):
    """Response body could not be decoded as JSON."""


class TransportError(HackerNewsError):
    """Underlying transport (DNS / TLS / connection) failed."""
