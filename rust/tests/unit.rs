//! Pure unit tests — uses the `mockito` crate for in-process HTTP mocking.
//! No Node mock-server subprocess required.

use std::time::Duration;

use hacker_news_client::{
    BaseFields, Comment, CommentTreeNode, Error, HackerNewsClient, Item, Job, Options, Poll,
    PollOpt, Story, Updates, User, DEFAULT_BASE_URL, DEFAULT_CONCURRENCY, DEFAULT_STORIES_LIMIT,
    DEFAULT_TIMEOUT,
};

fn client(server: &mockito::ServerGuard) -> HackerNewsClient {
    HackerNewsClient::new(Options {
        base_url: server.url(),
        ..Default::default()
    })
    .unwrap()
}

const STORY_1_JSON: &str = r#"{
    "by":"pg","descendants":3,"id":1,"kids":[15],"score":57,
    "time":1160418111,"title":"Y Combinator","type":"story",
    "url":"http://ycombinator.com"
}"#;

// ---------------------------- constants + defaults ----------------------------

#[test]
fn defaults_are_spec_compliant() {
    assert_eq!(DEFAULT_BASE_URL, "https://hacker-news.firebaseio.com/v0");
    assert_eq!(DEFAULT_TIMEOUT, Duration::from_secs(10));
    assert_eq!(DEFAULT_CONCURRENCY, 10);
    assert_eq!(DEFAULT_STORIES_LIMIT, 30);
}

#[test]
fn options_default_derives_from_hn_base_env() {
    let _guard = EnvGuard::set("HN_BASE", "http://env.test/v0///");
    let opts = Options::default();
    assert_eq!(opts.base_url, "http://env.test/v0");
    assert_eq!(opts.timeout, DEFAULT_TIMEOUT);
    assert_eq!(opts.concurrency, DEFAULT_CONCURRENCY);
}

#[test]
fn options_default_no_env_falls_back() {
    let _guard = EnvGuard::unset("HN_BASE");
    let opts = Options::default();
    assert!(opts.base_url.starts_with("https://hacker-news.firebaseio.com/v0"));
}

#[test]
fn client_new_succeeds() {
    let c = HackerNewsClient::new(Options {
        base_url: "http://x/v0".to_string(),
        timeout: Duration::from_secs(5),
        concurrency: 3,
        user_agent: "x".to_string(),
    });
    assert!(c.is_ok());
}

// ---------------------------- serde-only decode tests ----------------------------

#[test]
fn item_deserialize_each_variant() {
    let story: Item =
        serde_json::from_str(STORY_1_JSON).expect("story deserialize");
    assert!(matches!(story, Item::Story(_)));
    assert_eq!(story.id(), 1);
    assert_eq!(story.kind(), "story");

    let comment: Item = serde_json::from_str(
        r#"{"type":"comment","id":2,"time":1,"text":"hi","parent":1}"#,
    )
    .unwrap();
    assert!(matches!(comment, Item::Comment(_)));
    assert_eq!(comment.kind(), "comment");

    let job: Item = serde_json::from_str(
        r#"{"type":"job","id":3,"time":1,"title":"t","score":1}"#,
    )
    .unwrap();
    assert!(matches!(job, Item::Job(_)));
    assert_eq!(job.kind(), "job");

    let poll: Item = serde_json::from_str(
        r#"{"type":"poll","id":4,"time":1,"score":1,"parts":[10,11]}"#,
    )
    .unwrap();
    assert!(matches!(poll, Item::Poll(_)));
    assert_eq!(poll.kind(), "poll");

    let pollopt: Item = serde_json::from_str(
        r#"{"type":"pollopt","id":5,"time":1,"poll":4,"score":1}"#,
    )
    .unwrap();
    assert!(matches!(pollopt, Item::PollOpt(_)));
    assert_eq!(pollopt.kind(), "pollopt");
}

#[test]
fn user_deserialize() {
    let u: User = serde_json::from_str(
        r#"{"id":"pg","created":1,"karma":100,"about":"a","submitted":[1,2]}"#,
    )
    .unwrap();
    assert_eq!(u.id, "pg");
    assert_eq!(u.submitted, vec![1, 2]);
}

#[test]
fn updates_deserialize_defaults_empty() {
    let u: Updates = serde_json::from_str("{}").unwrap();
    assert!(u.items.is_empty());
    assert!(u.profiles.is_empty());
}

#[test]
fn comment_tree_node_constructs() {
    let node = CommentTreeNode {
        comment: Comment::default(),
        replies: vec![],
    };
    assert!(node.replies.is_empty());
}

#[test]
fn item_id_and_kind_across_variants() {
    let vars: Vec<Item> = vec![
        Item::Story(Story {
            base: BaseFields {
                id: 10,
                ..Default::default()
            },
            ..Default::default()
        }),
        Item::Comment(Comment {
            base: BaseFields {
                id: 11,
                ..Default::default()
            },
            ..Default::default()
        }),
        Item::Job(Job {
            base: BaseFields {
                id: 12,
                ..Default::default()
            },
            ..Default::default()
        }),
        Item::Poll(Poll {
            base: BaseFields {
                id: 13,
                ..Default::default()
            },
            parts: vec![],
            ..Default::default()
        }),
        Item::PollOpt(PollOpt {
            base: BaseFields {
                id: 14,
                ..Default::default()
            },
            poll: 0,
            ..Default::default()
        }),
    ];
    let ids: Vec<u64> = vars.iter().map(|i| i.id()).collect();
    assert_eq!(ids, vec![10, 11, 12, 13, 14]);
    let kinds: Vec<&str> = vars.iter().map(|i| i.kind()).collect();
    assert_eq!(kinds, vec!["story", "comment", "job", "poll", "pollopt"]);
}

// ---------------------------- mockito integration ----------------------------

#[tokio::test]
async fn item_happy_path_story() {
    let mut server = mockito::Server::new_async().await;
    let m = server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(STORY_1_JSON)
        .create_async()
        .await;

    let c = client(&server);
    let out = c.item(1).await.unwrap().unwrap();
    match out {
        Item::Story(s) => assert_eq!(s.title.as_deref(), Some("Y Combinator")),
        _ => panic!(),
    }
    m.assert_async().await;
}

#[tokio::test]
async fn item_null_body_returns_none() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/0.json")
        .with_status(200)
        .with_body("null")
        .create_async()
        .await;
    let c = client(&server);
    assert!(c.item(0).await.unwrap().is_none());
}

#[tokio::test]
async fn item_deleted_stub_returns_none() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/9.json")
        .with_status(200)
        .with_body(r#"{"id":9,"type":"comment","deleted":true,"time":1}"#)
        .create_async()
        .await;
    let c = client(&server);
    assert!(c.item(9).await.unwrap().is_none());
}

#[tokio::test]
async fn item_http_500_error() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(500)
        .with_body("{}")
        .create_async()
        .await;
    let c = client(&server);
    let err = c.item(1).await.unwrap_err();
    match err {
        Error::Http { status, .. } => assert_eq!(status, 500),
        _ => panic!("expected Http"),
    }
}

#[tokio::test]
async fn item_http_404_error() {
    let mut server = mockito::Server::new_async().await;
    // no mock registered → mockito returns 501 by default.
    // Explicitly register 404.
    server
        .mock("GET", "/item/1.json")
        .with_status(404)
        .with_body("{}")
        .create_async()
        .await;
    let c = client(&server);
    match c.item(1).await.unwrap_err() {
        Error::Http { status, .. } => assert_eq!(status, 404),
        other => panic!("expected Http 404, got {other:?}"),
    }
}

#[tokio::test]
async fn item_json_decode_error() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_body("not-json")
        .create_async()
        .await;
    let c = client(&server);
    match c.item(1).await.unwrap_err() {
        Error::Decode(_) => {}
        other => panic!("expected Decode, got {other:?}"),
    }
}

#[tokio::test]
async fn timeout_surfaces_as_timeout_error() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_body_from_request(|_| {
            std::thread::sleep(Duration::from_millis(200));
            b"null".to_vec()
        })
        .create_async()
        .await;
    let c = HackerNewsClient::new(Options {
        base_url: server.url(),
        timeout: Duration::from_millis(30),
        ..Default::default()
    })
    .unwrap();
    let err = c.item(1).await.unwrap_err();
    assert!(matches!(err, Error::Timeout { .. }));
}

#[tokio::test]
async fn items_batch_order_and_null_drop() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_body(STORY_1_JSON)
        .create_async()
        .await;
    server
        .mock("GET", "/item/2.json")
        .with_status(200)
        .with_body("null")
        .create_async()
        .await;
    server
        .mock("GET", "/item/3.json")
        .with_status(200)
        .with_body(r#"{"type":"story","id":3,"time":1,"title":"x","score":1,"descendants":0}"#)
        .create_async()
        .await;

    let c = client(&server);
    let out = c.items(&[1, 2, 3]).await.unwrap();
    let ids: Vec<u64> = out.iter().map(|i| i.id()).collect();
    assert_eq!(ids, vec![1, 3]);
}

#[tokio::test]
async fn items_empty_short_circuit() {
    let c = HackerNewsClient::new(Options {
        base_url: "http://unused".to_string(),
        ..Default::default()
    })
    .unwrap();
    assert!(c.items(&[]).await.unwrap().is_empty());
}

#[tokio::test]
async fn items_fail_fast() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_body(STORY_1_JSON)
        .expect_at_most(5)
        .create_async()
        .await;
    server
        .mock("GET", "/item/99.json")
        .with_status(500)
        .with_body("{}")
        .create_async()
        .await;

    let c = client(&server);
    let err = c.items(&[1, 99, 1, 1, 1]).await.unwrap_err();
    assert!(matches!(err, Error::Http { status: 500, .. }));
}

#[tokio::test]
async fn user_known_and_unknown() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/user/pg.json")
        .with_status(200)
        .with_body(r#"{"id":"pg","created":1,"karma":100}"#)
        .create_async()
        .await;
    server
        .mock("GET", "/user/nobody.json")
        .with_status(200)
        .with_body("null")
        .create_async()
        .await;

    let c = client(&server);
    let u = c.user("pg").await.unwrap().unwrap();
    assert_eq!(u.id, "pg");
    assert!(c.user("nobody").await.unwrap().is_none());
}

#[tokio::test]
async fn max_item_and_updates() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/maxitem.json")
        .with_status(200)
        .with_body("123")
        .create_async()
        .await;
    server
        .mock("GET", "/updates.json")
        .with_status(200)
        .with_body(r#"{"items":[1],"profiles":["pg"]}"#)
        .create_async()
        .await;

    let c = client(&server);
    assert_eq!(c.max_item().await.unwrap(), 123);
    let up = c.updates().await.unwrap();
    assert_eq!(up.items, vec![1]);
    assert_eq!(up.profiles, vec!["pg".to_string()]);
}

#[tokio::test]
async fn all_story_id_lists_and_hydration() {
    let mut server = mockito::Server::new_async().await;
    for path in [
        "/topstories.json",
        "/newstories.json",
        "/beststories.json",
        "/askstories.json",
        "/showstories.json",
        "/jobstories.json",
    ] {
        server
            .mock("GET", path)
            .with_status(200)
            .with_body(if path == "/topstories.json" { "[1]" } else { "[]" })
            .create_async()
            .await;
    }
    server
        .mock("GET", "/item/1.json")
        .with_status(200)
        .with_body(STORY_1_JSON)
        .create_async()
        .await;

    let c = client(&server);
    assert_eq!(c.top_story_ids().await.unwrap(), vec![1]);
    assert!(c.new_story_ids().await.unwrap().is_empty());
    assert!(c.best_story_ids().await.unwrap().is_empty());
    assert!(c.ask_story_ids().await.unwrap().is_empty());
    assert!(c.show_story_ids().await.unwrap().is_empty());
    assert!(c.job_story_ids().await.unwrap().is_empty());

    assert_eq!(c.top_stories(5).await.unwrap().len(), 1);
    assert!(c.new_stories(5).await.unwrap().is_empty());
    assert!(c.best_stories(5).await.unwrap().is_empty());
    assert!(c.ask_stories(5).await.unwrap().is_empty());
    assert!(c.show_stories(5).await.unwrap().is_empty());
    assert!(c.job_stories(5).await.unwrap().is_empty());
}

#[tokio::test]
async fn comment_tree_prunes_deleted_and_null() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/100.json")
        .with_status(200)
        .with_body(r#"{"id":100,"type":"comment","time":1,"kids":[101,102,103]}"#)
        .create_async()
        .await;
    server
        .mock("GET", "/item/101.json")
        .with_status(200)
        .with_body(r#"{"id":101,"type":"comment","time":1}"#)
        .create_async()
        .await;
    server
        .mock("GET", "/item/102.json")
        .with_status(200)
        .with_body(r#"{"id":102,"type":"comment","deleted":true,"time":1}"#)
        .create_async()
        .await;
    server
        .mock("GET", "/item/103.json")
        .with_status(200)
        .with_body("null")
        .create_async()
        .await;

    let c = client(&server);
    let root = c.comment_tree(100).await.unwrap().unwrap();
    assert_eq!(root.replies.len(), 1);
    assert_eq!(root.replies[0].comment.base.id, 101);
}

#[tokio::test]
async fn comment_tree_null_root() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/999.json")
        .with_status(200)
        .with_body("null")
        .create_async()
        .await;
    let c = client(&server);
    assert!(c.comment_tree(999).await.unwrap().is_none());
}

#[tokio::test]
async fn comment_tree_http_error_propagates() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/item/1.json")
        .with_status(500)
        .with_body("{}")
        .create_async()
        .await;
    let c = client(&server);
    assert!(matches!(
        c.comment_tree(1).await.unwrap_err(),
        Error::Http { status: 500, .. }
    ));
}

#[tokio::test]
async fn user_json_decode_error() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/user/x.json")
        .with_status(200)
        .with_body("not-json")
        .create_async()
        .await;
    let c = client(&server);
    match c.user("x").await.unwrap_err() {
        Error::Decode(_) => {}
        other => panic!("expected Decode, got {other:?}"),
    }
}

// Error::Display coverage
#[test]
fn error_display_and_debug() {
    let e = Error::Timeout {
        url: "u".to_string(),
    };
    assert!(format!("{e}").contains("timeout"));
    let e = Error::Http {
        status: 500,
        url: "u".to_string(),
    };
    assert!(format!("{e}").contains("500"));
}

// ---------------------------- env helper ----------------------------

/// Thread-safe-ish guard that sets or unsets an env var for the lifetime of
/// the scope, restoring the original value on Drop. Uses `std::sync::Mutex`
/// so parallel tests don't race on the same env var.
struct EnvGuard {
    key: String,
    prev: Option<String>,
}

impl EnvGuard {
    fn set(key: &str, val: &str) -> Self {
        let _lock = ENV_LOCK.lock().unwrap();
        let prev = std::env::var(key).ok();
        // SAFETY: env access guarded by ENV_LOCK.
        unsafe { std::env::set_var(key, val) };
        Self {
            key: key.to_string(),
            prev,
        }
    }
    fn unset(key: &str) -> Self {
        let _lock = ENV_LOCK.lock().unwrap();
        let prev = std::env::var(key).ok();
        // SAFETY: env access guarded by ENV_LOCK.
        unsafe { std::env::remove_var(key) };
        Self {
            key: key.to_string(),
            prev,
        }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        let _lock = ENV_LOCK.lock().unwrap();
        // SAFETY: env access guarded by ENV_LOCK.
        unsafe {
            match &self.prev {
                Some(v) => std::env::set_var(&self.key, v),
                None => std::env::remove_var(&self.key),
            }
        }
    }
}

static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
