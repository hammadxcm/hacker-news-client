# frozen_string_literal: true

$LOAD_PATH.unshift File.expand_path("../lib", __dir__)

require "minitest/autorun"
require "open-uri"
require "hacker_news_client"

REPO_ROOT = File.expand_path("../..", __dir__)

def start_mock_server
  env = { "MOCK_PORT" => "0", "MOCK_SLOW_MS" => "100" }
  cmd = ["node", File.join(REPO_ROOT, "test", "mock-server.js")]
  r, w = IO.pipe
  pid = Process.spawn(env, *cmd, out: w, err: :err)
  w.close
  line = r.readline
  base = line.split(" on ", 2).last.strip
  # readiness probe
  10.times do
    begin
      URI.open("#{base}/maxitem.json", read_timeout: 0.5).read
      break
    rescue StandardError
      sleep 0.05
    end
  end
  [pid, base, r]
end

class ClientTest < Minitest::Test
  @@pid = nil
  @@base = nil
  @@stdout = nil

  def self.startup
    return if @@pid

    @@pid, @@base, @@stdout = start_mock_server
    Minitest.after_run do
      Process.kill("TERM", @@pid)
      begin
        Process.waitpid(@@pid)
      rescue StandardError
        # already reaped
      end
      @@stdout&.close
    end
  end

  def setup
    self.class.startup
    @client = HackerNewsClient::Client.new(base_url: @@base)
  end

  def test_item_story
    item = @client.item(1)
    assert_kind_of HackerNewsClient::Story, item
    assert_equal "pg", item.by
    assert_equal "Y Combinator", item.title
  end

  def test_item_variants
    assert_kind_of HackerNewsClient::Comment, @client.item(8001)
    assert_kind_of HackerNewsClient::Job,     @client.item(192_327)
    assert_kind_of HackerNewsClient::Poll,    @client.item(126_809)
    assert_kind_of HackerNewsClient::PollOpt, @client.item(126_810)
  end

  def test_item_null
    assert_nil @client.item(0)
  end

  def test_item_deleted_stub
    assert_nil @client.item(8004)
  end

  def test_item_dead
    it = @client.item(9999)
    refute_nil it
    assert it.dead
  end

  def test_items_order_and_null_drop
    out = @client.items([1, 0, 8001, 8004, 192_327])
    assert_equal [1, 8001, 192_327], out.map(&:id)
  end

  def test_items_fail_fast
    assert_raises(HackerNewsClient::HttpError) do
      @client.items([1, 99_999_999, 8001])
    end
  end

  def test_items_empty
    assert_equal [], @client.items([])
  end

  def test_user
    u = @client.user("pg")
    refute_nil u
    assert_equal "pg", u.id
    assert_nil @client.user("nobody")
  end

  def test_max_item_and_updates
    assert_kind_of Integer, @client.max_item
    up = @client.updates
    refute_empty up.items
  end

  def test_story_id_lists
    assert_kind_of Array, @client.top_story_ids
    assert_equal [], @client.show_story_ids
  end

  def test_top_stories_hydration
    assert_operator @client.top_stories(limit: 3).size, :<=, 3
  end

  def test_comment_tree_prunes_deleted
    root = @client.comment_tree(8000)
    refute_nil root
    assert_equal 2, root.replies.size
    c1, c2 = root.replies
    assert_equal [8003], c1.replies.map(&:id)
    assert_equal [8005], c2.replies.map(&:id)
  end

  def test_http_500
    assert_raises(HackerNewsClient::HttpError) { @client.item(99_999_999) }
  end

  def test_timeout
    fast = HackerNewsClient::Client.new(base_url: @@base, timeout: 0.03)
    assert_raises(HackerNewsClient::TimeoutError) { fast.item(99_999_998) }
  end

  def test_unknown_path_404
    err = assert_raises(HackerNewsClient::HttpError) do
      @client.user("../nonexistent-endpoint")
    end
    assert_equal 404, err.status
  end
end
