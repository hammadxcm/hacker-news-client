//! Integration tests against the shared Node mock server.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

use hacker_news_client::{Error, HackerNewsClient, Item, Options};

struct Mock {
    base: String,
    #[allow(dead_code)]
    child: Child,
}

static MOCK: OnceLock<Mock> = OnceLock::new();

fn mock_base() -> &'static str {
    &MOCK.get_or_init(start_mock).base
}

fn start_mock() -> Mock {
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let mut child = Command::new("node")
        .arg(repo_root.join("test").join("mock-server.js"))
        .env("MOCK_PORT", "0")
        .env("MOCK_SLOW_MS", "100")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn mock server");
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    // "mock-server listening on http://localhost:<port>/v0"
    let base = line.split(" on ").nth(1).unwrap().trim().to_string();
    Mock { base, child }
}

fn client() -> HackerNewsClient {
    HackerNewsClient::new(Options {
        base_url: mock_base().to_string(),
        ..Default::default()
    })
    .unwrap()
}

#[tokio::test]
async fn item_story() {
    let it = client().item(1).await.unwrap().unwrap();
    match it {
        Item::Story(s) => {
            assert_eq!(s.base.id, 1);
            assert_eq!(s.base.by.as_deref(), Some("pg"));
            assert_eq!(s.title.as_deref(), Some("Y Combinator"));
        }
        _ => panic!("expected Story"),
    }
}

#[tokio::test]
async fn item_each_variant() {
    let c = client();
    assert!(matches!(
        c.item(8001).await.unwrap().unwrap(),
        Item::Comment(_)
    ));
    assert!(matches!(
        c.item(192_327).await.unwrap().unwrap(),
        Item::Job(_)
    ));
    assert!(matches!(
        c.item(126_809).await.unwrap().unwrap(),
        Item::Poll(_)
    ));
    assert!(matches!(
        c.item(126_810).await.unwrap().unwrap(),
        Item::PollOpt(_)
    ));
}

#[tokio::test]
async fn item_null() {
    assert!(client().item(0).await.unwrap().is_none());
}

#[tokio::test]
async fn item_deleted_stub() {
    assert!(client().item(8004).await.unwrap().is_none());
}

#[tokio::test]
async fn item_dead() {
    let it = client().item(9999).await.unwrap().unwrap();
    match it {
        Item::Comment(c) => assert!(c.base.dead),
        _ => panic!("expected Comment"),
    }
}

#[tokio::test]
async fn items_order_and_null_drop() {
    let c = client();
    let out = c.items(&[1, 0, 8001, 8004, 192_327]).await.unwrap();
    let ids: Vec<u64> = out.iter().map(|i| i.id()).collect();
    assert_eq!(ids, vec![1, 8001, 192_327]);
}

#[tokio::test]
async fn items_fail_fast_500() {
    let err = client().items(&[1, 99_999_999, 8001]).await.unwrap_err();
    match err {
        Error::Http { status, .. } => assert_eq!(status, 500),
        other => panic!("expected Http 500, got {other:?}"),
    }
}

#[tokio::test]
async fn items_empty() {
    assert!(client().items(&[]).await.unwrap().is_empty());
}

#[tokio::test]
async fn user_known_and_unknown() {
    let c = client();
    let pg = c.user("pg").await.unwrap().unwrap();
    assert_eq!(pg.id, "pg");
    assert!(c.user("nobody").await.unwrap().is_none());
}

#[tokio::test]
async fn max_item_and_updates() {
    let c = client();
    assert!(c.max_item().await.unwrap() > 0);
    let u = c.updates().await.unwrap();
    assert!(!u.items.is_empty());
}

#[tokio::test]
async fn id_lists() {
    let c = client();
    assert!(!c.top_story_ids().await.unwrap().is_empty());
    assert!(c.show_story_ids().await.unwrap().is_empty());
}

#[tokio::test]
async fn top_stories_hydration() {
    let out = client().top_stories(3).await.unwrap();
    assert!(out.len() <= 3);
}

#[tokio::test]
async fn comment_tree_prunes_deleted() {
    let root = client().comment_tree(8000).await.unwrap().unwrap();
    assert_eq!(root.replies.len(), 2);
    let c1 = &root.replies[0];
    let c2 = &root.replies[1];
    let c1_ids: Vec<u64> = c1.replies.iter().map(|r| r.comment.base.id).collect();
    let c2_ids: Vec<u64> = c2.replies.iter().map(|r| r.comment.base.id).collect();
    assert_eq!(c1_ids, vec![8003]);
    assert_eq!(c2_ids, vec![8005]);
}

#[tokio::test]
async fn http_500_propagates() {
    let err = client().item(99_999_999).await.unwrap_err();
    match err {
        Error::Http { status, .. } => assert_eq!(status, 500),
        other => panic!("expected Http, got {other:?}"),
    }
}

#[tokio::test]
async fn timeout_surfaces() {
    let fast = HackerNewsClient::new(Options {
        base_url: mock_base().to_string(),
        timeout: Duration::from_millis(30),
        ..Default::default()
    })
    .unwrap();
    let err = fast.item(99_999_998).await.unwrap_err();
    assert!(matches!(err, Error::Timeout { .. }));
}

#[tokio::test]
async fn unknown_path_404() {
    let err = client().user("../nonexistent-endpoint").await.unwrap_err();
    match err {
        Error::Http { status, .. } => assert_eq!(status, 404),
        other => panic!("expected Http 404, got {other:?}"),
    }
}
