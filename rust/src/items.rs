//! Typed item model.
//!
//! The wire format is a discriminated union keyed by the `type` string. The
//! [`Item`] enum maps that directly to a Rust sum type using serde's internal
//! tagging.

use serde::{Deserialize, Serialize};

/// Fields shared by every item variant.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct BaseFields {
    /// Unique item id.
    pub id: u64,
    /// Author username. Absent on deleted tombstones.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
    /// Submission time, Unix seconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<u64>,
    /// True if the item has been flagged / mod-killed (distinct from deletion).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub dead: bool,
}

/// A submitted HN story.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Story {
    #[serde(flatten)]
    /// Common fields.
    pub base: BaseFields,
    /// Story title (HTML).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Net vote score.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// Total comment count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descendants: Option<i64>,
    /// External link; absent on self-posts, may also be empty string on jobs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Body text on self-posts (HTML).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Top-level comment ids in ranked display order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub kids: Vec<u64>,
}

/// A comment.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Comment {
    #[serde(flatten)]
    /// Common fields.
    pub base: BaseFields,
    /// Parent comment or root story id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<u64>,
    /// Comment body (HTML).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Direct reply ids in ranked order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub kids: Vec<u64>,
}

/// A YC-posted job listing.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Job {
    #[serde(flatten)]
    /// Common fields.
    pub base: BaseFields,
    /// Job title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Score (often 1 for jobs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// External link — may be empty string.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Job description body (HTML).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// A multiple-choice poll.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Poll {
    #[serde(flatten)]
    /// Common fields.
    pub base: BaseFields,
    /// Poll title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Net score.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// Comment count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descendants: Option<i64>,
    /// Ordered PollOpt ids.
    pub parts: Vec<u64>,
    /// Poll prompt body (may be empty).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Comments on the poll.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub kids: Vec<u64>,
}

/// A single option under a [`Poll`].
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PollOpt {
    #[serde(flatten)]
    /// Common fields.
    pub base: BaseFields,
    /// The parent poll's id.
    pub poll: u64,
    /// Votes received by this option.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// Option text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// Discriminated-union `Item`. Tagged by the wire `type` field.
///
/// # Examples
///
/// ```
/// # use hacker_news_client::Item;
/// let json = r#"{"type":"story","id":1,"by":"pg","title":"x","score":1,"descendants":0,"time":1}"#;
/// let item: Item = serde_json::from_str(json).unwrap();
/// match item {
///     Item::Story(s) => assert_eq!(s.base.id, 1),
///     _ => panic!("expected story"),
/// }
/// ```
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    /// A submitted story.
    Story(Story),
    /// A comment.
    Comment(Comment),
    /// A YC job listing.
    Job(Job),
    /// A poll.
    Poll(Poll),
    /// A poll option. Explicit rename documents the wire string.
    #[serde(rename = "pollopt")]
    PollOpt(PollOpt),
}

impl Item {
    /// The item's numeric id.
    pub fn id(&self) -> u64 {
        match self {
            Item::Story(s) => s.base.id,
            Item::Comment(c) => c.base.id,
            Item::Job(j) => j.base.id,
            Item::Poll(p) => p.base.id,
            Item::PollOpt(o) => o.base.id,
        }
    }

    /// The item's wire type string.
    pub fn kind(&self) -> &'static str {
        match self {
            Item::Story(_) => "story",
            Item::Comment(_) => "comment",
            Item::Job(_) => "job",
            Item::Poll(_) => "poll",
            Item::PollOpt(_) => "pollopt",
        }
    }
}

/// A user profile.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct User {
    /// Case-sensitive username.
    pub id: String,
    /// Account creation time, Unix seconds.
    pub created: u64,
    /// Total karma.
    pub karma: i64,
    /// About / bio (HTML).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub about: Option<String>,
    /// Submitted items.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub submitted: Vec<u64>,
}

/// The `/updates` endpoint record.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Updates {
    /// Recently changed item ids.
    #[serde(default)]
    pub items: Vec<u64>,
    /// Recently changed profile usernames.
    #[serde(default)]
    pub profiles: Vec<String>,
}

/// A comment tree node: a comment plus its recursively-fetched replies.
#[derive(Debug, Clone)]
pub struct CommentTreeNode {
    /// The underlying comment payload (may actually be the root story).
    pub comment: Comment,
    /// Replies, in ranked order. Deleted nodes pruned.
    pub replies: Vec<CommentTreeNode>,
}
