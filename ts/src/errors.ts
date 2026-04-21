/**
 * Error hierarchy for the TypeScript client. Mirrors the JS library; adds strict
 * types on `status` / `url` / `cause`.
 */

export interface ErrorDetails {
  readonly url?: string;
  readonly status?: number;
  readonly cause?: unknown;
}

/**
 * Base class for every error surfaced by the client.
 * @example
 * try { await client.item(1); }
 * catch (err) {
 *   if (err instanceof HackerNewsError) console.error(err.url, err.cause);
 * }
 */
export class HackerNewsError extends Error {
  readonly url: string | undefined;
  readonly status: number | undefined;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'HackerNewsError';
    this.url = details.url;
    this.status = details.status;
  }
}

/** Request exceeded the client's total timeout. */
export class TimeoutError extends HackerNewsError {
  constructor(details: ErrorDetails = {}) {
    super('hn: timeout', details);
    this.name = 'TimeoutError';
  }
}

/** Server returned a non-2xx status. `status` is always set. */
export class HttpError extends HackerNewsError {
  constructor(details: ErrorDetails & { status: number }) {
    super(`hn: http ${details.status}`, details);
    this.name = 'HttpError';
  }
}

/** Response body could not be decoded as JSON. */
export class JsonError extends HackerNewsError {
  constructor(details: ErrorDetails) {
    super('hn: invalid json', details);
    this.name = 'JsonError';
  }
}

/** Underlying transport (DNS / TLS / connection) failed. */
export class TransportError extends HackerNewsError {
  constructor(details: ErrorDetails) {
    super('hn: transport failure', details);
    this.name = 'TransportError';
  }
}
