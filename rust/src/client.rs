//! Async HN client.

use std::sync::Arc;
use std::time::Duration;

use async_recursion::async_recursion;
use reqwest::Client as HttpClient;
use tokio::sync::Semaphore;

use crate::errors::{Error, Result};
use crate::items::{Comment, CommentTreeNode, Item, Updates, User};

/// Default API root.
pub const DEFAULT_BASE_URL: &str = "https://hacker-news.firebaseio.com/v0";
/// Default total timeout per request.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
/// Default bounded concurrency for batch calls.
pub const DEFAULT_CONCURRENCY: usize = 10;
/// Default stories limit for `*_stories()` hydration.
pub const DEFAULT_STORIES_LIMIT: usize = 30;

/// Construction options for [`HackerNewsClient`].
#[derive(Debug, Clone)]
pub struct Options {
    /// API root URL.
    pub base_url: String,
    /// Per-request total timeout.
    pub timeout: Duration,
    /// Bounded fan-out for batch methods.
    pub concurrency: usize,
    /// HTTP `User-Agent` header.
    pub user_agent: String,
}

impl Default for Options {
    fn default() -> Self {
        let base = std::env::var("HN_BASE").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Self {
            base_url: base.trim_end_matches('/').to_string(),
            timeout: DEFAULT_TIMEOUT,
            concurrency: DEFAULT_CONCURRENCY,
            user_agent: concat!("hn-client-rust/", env!("CARGO_PKG_VERSION")).to_string(),
        }
    }
}

/// Async client for the official Hacker News Firebase API.
///
/// # Examples
///
/// ```no_run
/// use hacker_news_client::HackerNewsClient;
/// # async fn run() -> hacker_news_client::Result<()> {
/// let client = HackerNewsClient::new(Default::default())?;
/// let item = client.item(1).await?;
/// println!("{:?}", item);
/// # Ok(()) }
/// ```
#[derive(Clone)]
pub struct HackerNewsClient {
    base_url: Arc<str>,
    http: HttpClient,
    sem: Arc<Semaphore>,
    user_agent: Arc<str>,
    concurrency: usize,
}

impl HackerNewsClient {
    /// Construct a client with the given options.
    pub fn new(opts: Options) -> Result<Self> {
        let http = HttpClient::builder()
            .user_agent(&opts.user_agent)
            .timeout(opts.timeout)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()?;
        Ok(Self {
            base_url: Arc::from(opts.base_url.trim_end_matches('/').to_string()),
            http,
            sem: Arc::new(Semaphore::new(opts.concurrency)),
            user_agent: Arc::from(opts.user_agent),
            concurrency: opts.concurrency,
        })
    }

    async fn raw_get(&self, path: &str) -> Result<Vec<u8>> {
        let url = format!("{}{}", self.base_url, path);
        let resp = match self.http.get(&url).send().await {
            Ok(r) => r,
            Err(e) if e.is_timeout() => return Err(Error::Timeout { url }),
            Err(e) => return Err(Error::Transport(e)),
        };
        let status = resp.status();
        if !status.is_success() {
            let _ = resp.bytes().await; // drain for connection reuse
            return Err(Error::Http {
                status: status.as_u16(),
                url,
            });
        }
        let bytes = resp.bytes().await.map_err(Error::Transport)?;
        Ok(bytes.to_vec())
    }

    async fn get_value(&self, path: &str) -> Result<serde_json::Value> {
        let body = self.raw_get(path).await?;
        if trim_is_null(&body) {
            return Ok(serde_json::Value::Null);
        }
        Ok(serde_json::from_slice(&body)?)
    }

    /// Fetch a single item. Returns `Ok(None)` for unknown ids and
    /// `{"deleted":true}` stubs.
    pub async fn item(&self, id: u64) -> Result<Option<Item>> {
        let path = format!("/item/{id}.json");
        let v = self.get_value(&path).await?;
        match &v {
            serde_json::Value::Null => Ok(None),
            serde_json::Value::Object(obj)
                if obj.get("deleted") == Some(&serde_json::Value::Bool(true)) =>
            {
                Ok(None)
            }
            _ => Ok(Some(serde_json::from_value(v)?)),
        }
    }

    /// Batch-fetch items with bounded concurrency. Nulls/deleted dropped;
    /// survivors preserve relative input order. Fail-fast.
    pub async fn items(&self, ids: &[u64]) -> Result<Vec<Item>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        // Use one local semaphore so we don't block shared traffic. Size it by
        // the client's `concurrency`.
        let sem = Arc::new(Semaphore::new(self.concurrency));
        let mut set: tokio::task::JoinSet<(usize, Result<Option<Item>>)> =
            tokio::task::JoinSet::new();
        for (i, &id) in ids.iter().enumerate() {
            let this = self.clone();
            let permit_sem = sem.clone();
            set.spawn(async move {
                let _permit = permit_sem.acquire_owned().await.unwrap();
                (i, this.item(id).await)
            });
        }
        let mut results: Vec<Option<Item>> = vec![None; ids.len()];
        let mut first_err: Option<Error> = None;
        while let Some(joined) = set.join_next().await {
            let (i, res) = match joined {
                Ok(pair) => pair,
                Err(join_err) if join_err.is_cancelled() => continue,
                Err(join_err) => panic!("join error: {join_err}"),
            };
            match res {
                Ok(item) => results[i] = item,
                Err(e) => {
                    if first_err.is_none() {
                        first_err = Some(e);
                        set.abort_all();
                    }
                }
            }
        }
        if let Some(e) = first_err {
            return Err(e);
        }
        Ok(results.into_iter().flatten().collect())
    }

    /// Fetch a user profile. `Ok(None)` for unknown usernames.
    pub async fn user(&self, username: &str) -> Result<Option<User>> {
        let v = self.get_value(&format!("/user/{username}.json")).await?;
        if v.is_null() {
            return Ok(None);
        }
        Ok(Some(serde_json::from_value(v)?))
    }

    /// Current largest item id.
    pub async fn max_item(&self) -> Result<u64> {
        let v = self.get_value("/maxitem.json").await?;
        Ok(serde_json::from_value(v)?)
    }

    /// Recently-changed items and profiles.
    pub async fn updates(&self) -> Result<Updates> {
        let v = self.get_value("/updates.json").await?;
        Ok(serde_json::from_value(v)?)
    }

    async fn id_list(&self, path: &str) -> Result<Vec<u64>> {
        let v = self.get_value(path).await?;
        Ok(serde_json::from_value(v)?)
    }

    /// Up-to-500 top stories (ranked).
    pub async fn top_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/topstories.json").await
    }
    /// Up-to-500 newest stories (reverse-chronological).
    pub async fn new_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/newstories.json").await
    }
    /// Best stories.
    pub async fn best_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/beststories.json").await
    }
    /// Up-to-200 Ask HN stories.
    pub async fn ask_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/askstories.json").await
    }
    /// Up-to-200 Show HN stories.
    pub async fn show_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/showstories.json").await
    }
    /// Up-to-200 job listings.
    pub async fn job_story_ids(&self) -> Result<Vec<u64>> {
        self.id_list("/jobstories.json").await
    }

    async fn hydrate(&self, ids: Vec<u64>, limit: usize) -> Result<Vec<Item>> {
        let slice = if ids.len() > limit {
            &ids[..limit]
        } else {
            &ids[..]
        };
        self.items(slice).await
    }

    /// Hydrate the first `limit` top stories.
    pub async fn top_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.top_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }
    /// Hydrate the first `limit` newest stories.
    pub async fn new_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.new_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }
    /// Hydrate the first `limit` best stories.
    pub async fn best_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.best_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }
    /// Hydrate the first `limit` Ask HN stories.
    pub async fn ask_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.ask_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }
    /// Hydrate the first `limit` Show HN stories.
    pub async fn show_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.show_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }
    /// Hydrate the first `limit` job listings.
    pub async fn job_stories(&self, limit: usize) -> Result<Vec<Item>> {
        let ids = self.job_story_ids().await?;
        self.hydrate(ids, limit.max(1)).await
    }

    /// Recursively fetch a comment tree rooted at `id`. One global semaphore
    /// bounds concurrency across the entire tree. Deleted nodes pruned.
    pub async fn comment_tree(&self, id: u64) -> Result<Option<CommentTreeNode>> {
        self.visit(id).await
    }

    #[async_recursion]
    async fn visit(&self, id: u64) -> Result<Option<CommentTreeNode>> {
        // Acquire semaphore only for the HTTP fetch — released before we
        // recurse into children so they can acquire their own permits.
        let body = {
            let _permit = self.sem.acquire().await.unwrap();
            self.raw_get(&format!("/item/{id}.json")).await?
        };
        if trim_is_null(&body) {
            return Ok(None);
        }
        let v: serde_json::Value = serde_json::from_slice(&body)?;
        if v.get("deleted") == Some(&serde_json::Value::Bool(true)) {
            return Ok(None);
        }
        let comment: Comment = serde_json::from_value(v).unwrap_or_default();
        let kid_ids = comment.kids.clone();

        if kid_ids.is_empty() {
            return Ok(Some(CommentTreeNode {
                comment,
                replies: Vec::new(),
            }));
        }

        // Fan-out children in parallel with fail-fast cancellation. Results
        // are indexed so the final reply order matches kid_ids order.
        let mut set: tokio::task::JoinSet<(usize, Result<Option<CommentTreeNode>>)> =
            tokio::task::JoinSet::new();
        for (i, kid) in kid_ids.iter().enumerate() {
            let this = self.clone();
            let k = *kid;
            set.spawn(async move { (i, this.visit(k).await) });
        }

        let mut indexed: Vec<Option<CommentTreeNode>> = (0..kid_ids.len()).map(|_| None).collect();
        let mut first_err: Option<Error> = None;
        while let Some(joined) = set.join_next().await {
            match joined {
                Ok((i, Ok(node))) => indexed[i] = node,
                Ok((_, Err(e))) => {
                    if first_err.is_none() {
                        first_err = Some(e);
                        set.abort_all();
                    }
                }
                Err(join_err) if join_err.is_cancelled() => continue,
                Err(join_err) => panic!("comment_tree task panic: {join_err}"),
            }
        }
        if let Some(e) = first_err {
            return Err(e);
        }
        let replies: Vec<CommentTreeNode> = indexed.into_iter().flatten().collect();
        Ok(Some(CommentTreeNode { comment, replies }))
    }

    #[allow(dead_code)]
    fn user_agent(&self) -> &str {
        &self.user_agent
    }
}

fn trim_is_null(b: &[u8]) -> bool {
    let s = std::str::from_utf8(b).unwrap_or("").trim();
    s == "null" || s.is_empty()
}
