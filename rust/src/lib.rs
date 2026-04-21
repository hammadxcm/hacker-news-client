//! Async client for the Hacker News Firebase API.
//!
//! Exposes [`HackerNewsClient`] plus the typed [`Item`] sum type and supporting
//! error/User/Updates types.
//!
//! # Quickstart
//!
//! ```no_run
//! use hacker_news_client::{HackerNewsClient, Options};
//!
//! # async fn run() -> hacker_news_client::Result<()> {
//! let client = HackerNewsClient::new(Options::default())?;
//! let item = client.item(1).await?;
//! println!("{:?}", item);
//! # Ok(()) }
//! ```

#![deny(missing_docs)]

mod client;
mod errors;
mod items;

pub use client::{
    HackerNewsClient, Options, DEFAULT_BASE_URL, DEFAULT_CONCURRENCY, DEFAULT_STORIES_LIMIT,
    DEFAULT_TIMEOUT,
};
pub use errors::{Error, Result};
pub use items::{BaseFields, Comment, CommentTreeNode, Item, Job, Poll, PollOpt, Story, Updates, User};
