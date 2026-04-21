//! Runnable example hitting the live HN API.
//!
//! Run: `cargo run --example example`

use hacker_news_client::{HackerNewsClient, Item, Options};

#[tokio::main]
async fn main() -> hacker_news_client::Result<()> {
    let client = HackerNewsClient::new(Options::default())?;
    for item in client.top_stories(5).await? {
        if let Item::Story(s) = item {
            println!(
                "• {} — {} ({} points)",
                s.title.as_deref().unwrap_or("(untitled)"),
                s.base.by.as_deref().unwrap_or("?"),
                s.score.unwrap_or(0)
            );
        }
    }
    Ok(())
}
