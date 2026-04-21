//! Error types for the Hacker News client.

use thiserror::Error;

/// Error variants surfaced by [`crate::HackerNewsClient`].
///
/// # Examples
///
/// ```no_run
/// use hacker_news_client::{HackerNewsClient, Error};
/// # async fn run() -> Result<(), Error> {
/// let client = HackerNewsClient::new(Default::default())?;
/// match client.item(1).await {
///     Ok(Some(item)) => println!("{:?}", item),
///     Ok(None) => println!("deleted or missing"),
///     Err(Error::Http { status, .. }) => eprintln!("http {}", status),
///     Err(other) => return Err(other),
/// }
/// # Ok(()) }
/// ```
#[derive(Debug, Error)]
pub enum Error {
    /// Request exceeded the client's total timeout budget.
    #[error("hn: timeout at {url}")]
    Timeout {
        /// The URL being fetched.
        url: String,
    },

    /// Server returned a non-2xx status.
    #[error("hn: http {status} at {url}")]
    Http {
        /// HTTP status code.
        status: u16,
        /// The URL being fetched.
        url: String,
    },

    /// Response body could not be decoded as JSON.
    #[error("hn: decode error: {0}")]
    Decode(#[from] serde_json::Error),

    /// Underlying transport / TLS / connection failure.
    #[error("hn: transport error: {0}")]
    Transport(#[from] reqwest::Error),

    /// A spawned task panicked or was otherwise unable to complete.
    /// This is distinct from a cancellation (which is handled silently) and
    /// surfaces bugs in the client itself rather than remote-server problems.
    #[error("hn: task failure: {0}")]
    Task(String),
}

/// Convenient alias matching crate-wide [`Result`](std::result::Result).
pub type Result<T> = std::result::Result<T, Error>;
