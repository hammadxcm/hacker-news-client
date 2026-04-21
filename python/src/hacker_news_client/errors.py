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


class HnTimeoutError(HackerNewsError):
    """Request exceeded the client's total timeout.

    Named ``HnTimeoutError`` rather than ``TimeoutError`` to avoid shadowing
    the Python stdlib builtin. Callers composing with ``asyncio``,
    ``concurrent.futures``, or ``socket`` will thank you.
    """


# Back-compat alias. Deprecated — will be removed before 1.0. Importing
# ``TimeoutError`` from this module still works, but it now refers to the
# same class as ``HnTimeoutError`` (not the stdlib builtin). New code should
# import ``HnTimeoutError``.
TimeoutError = HnTimeoutError  # noqa: A001


class HttpError(HackerNewsError):
    """Server returned a non-2xx status. ``status`` is always set."""


class JsonError(HackerNewsError):
    """Response body could not be decoded as JSON."""


class TransportError(HackerNewsError):
    """Underlying transport (DNS / TLS / connection) failed."""
