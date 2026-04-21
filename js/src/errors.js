/**
 * Base class for every error surfaced by {@link HackerNewsClient}.
 * Carries the URL that was being fetched and an optional underlying `cause`.
 *
 * @example
 * try { await client.item(1); }
 * catch (err) {
 *   if (err instanceof HackerNewsError) console.error(err.url, err.cause);
 * }
 */
export class HackerNewsError extends Error {
  /**
   * @param {string} message
   * @param {{ url?: string, status?: number, cause?: unknown }} [details]
   */
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'HackerNewsError';
    /** @type {string | undefined} */
    this.url = details.url;
    /** @type {number | undefined} */
    this.status = details.status;
  }
}

/** Request exceeded the client's total timeout. */
export class TimeoutError extends HackerNewsError {
  constructor(details = {}) {
    super('hn: timeout', details);
    this.name = 'TimeoutError';
  }
}

/** Server returned a non-2xx status. `status` and `url` are set. */
export class HttpError extends HackerNewsError {
  constructor(details) {
    super(`hn: http ${details.status}`, details);
    this.name = 'HttpError';
  }
}

/** Response body could not be decoded as JSON. */
export class JsonError extends HackerNewsError {
  constructor(details) {
    super('hn: invalid json', details);
    this.name = 'JsonError';
  }
}

/** Underlying transport (DNS / TLS / connection) failed. */
export class TransportError extends HackerNewsError {
  constructor(details) {
    super('hn: transport failure', details);
    this.name = 'TransportError';
  }
}
