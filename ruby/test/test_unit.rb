# frozen_string_literal: true

# Pure unit tests — mocks Hacker::News::Client's transport; no network, no
# subprocess. Validates decode / error-mapping / concurrency logic.

# SimpleCov must be required BEFORE the library for coverage instrumentation.
if ENV['COVERAGE'] == '1'
  require 'simplecov'
  SimpleCov.start do
    track_files 'lib/**/*.rb'
    enable_coverage :branch
    command_name 'unit'
    formatter SimpleCov::Formatter::SimpleFormatter
  end
end

$LOAD_PATH.unshift File.expand_path('../lib', __dir__)

require 'minitest/autorun'
require 'json'
require 'hacker/news/client'

# FakeResponse: minimal stand-in for a Net::HTTPResponse.
FakeResponse = Struct.new(:code, :body)

# fake_transport: build a transport lambda that looks up URL → spec.
# Spec types:
#   Hash / Array / Integer / nil    → 200 + json-encoded
#   String                          → 200 + literal body
#   Integer >= 400                  → that status + "{}"
#   Exception                       → raises
#   ->(url, timeout, ua) { ... }    → called directly
def fake_transport(routes)
  lambda { |url, timeout, ua|
    spec = routes.fetch(url) { raise "no route for #{url}" }
    case spec
    when Exception then raise spec
    when Proc      then spec.call(url, timeout, ua)
    when Integer
      if spec >= 400
        FakeResponse.new(spec.to_s, '{}')
      else
        FakeResponse.new('200', spec.to_json)
      end
    when String then FakeResponse.new('200', spec)
    else FakeResponse.new('200', spec.to_json)
    end
  }
end

STORY_1 = {
  'by' => 'pg', 'descendants' => 3, 'id' => 1, 'kids' => [15], 'score' => 57,
  'time' => 1_160_418_111, 'title' => 'Y Combinator', 'type' => 'story',
  'url' => 'http://ycombinator.com'
}.freeze

BASE = 'http://mock/v0'

class ConstructorTests < Minitest::Test
  def test_defaults
    c = Hacker::News::Client.new
    assert c.base_url.start_with?('https://hacker-news.firebaseio.com/v0')
    assert_equal Hacker::News::Client::DEFAULT_TIMEOUT, c.timeout
    assert_equal Hacker::News::Client::DEFAULT_CONCURRENCY, c.concurrency
    assert c.user_agent.start_with?('hn-client-ruby/')
  end

  def test_strips_trailing_slash
    c = Hacker::News::Client.new(base_url: 'http://x/v0///')
    assert_equal 'http://x/v0', c.base_url
  end

  def test_hn_base_env
    prev = ENV.fetch('HN_BASE', nil)
    ENV['HN_BASE'] = 'http://env.test/v0'
    c = Hacker::News::Client.new
    assert_equal 'http://env.test/v0', c.base_url
  ensure
    prev.nil? ? ENV.delete('HN_BASE') : (ENV['HN_BASE'] = prev)
  end
end

class ItemDecodeTests < Minitest::Test
  def setup
    @client = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/item/1.json" => STORY_1,
        "#{BASE}/item/2.json" => { 'id' => 2, 'type' => 'comment', 'time' => 1, 'text' => 'hi' },
        "#{BASE}/item/3.json" => { 'id' => 3, 'type' => 'job', 'time' => 1, 'title' => 'x',
                                   'score' => 1 },
        "#{BASE}/item/4.json" => { 'id' => 4, 'type' => 'poll', 'time' => 1, 'score' => 1,
                                   'parts' => [10] },
        "#{BASE}/item/5.json" => { 'id' => 5, 'type' => 'pollopt', 'time' => 1, 'poll' => 4,
                                   'score' => 1 },
        "#{BASE}/item/0.json" => nil,
        "#{BASE}/item/9.json" => { 'id' => 9, 'type' => 'comment', 'deleted' => true, 'time' => 1 }
      )
    )
  end

  def test_story
    assert_kind_of Hacker::News::Story, @client.item(1)
  end

  def test_every_variant
    assert_kind_of Hacker::News::Comment, @client.item(2)
    assert_kind_of Hacker::News::Job,     @client.item(3)
    assert_kind_of Hacker::News::Poll,    @client.item(4)
    assert_kind_of Hacker::News::PollOpt, @client.item(5)
  end

  def test_null_body_returns_nil
    assert_nil @client.item(0)
  end

  def test_deleted_stub_returns_nil
    assert_nil @client.item(9)
  end

  def test_unknown_type_raises_argument_error
    assert_raises(ArgumentError) do
      Hacker::News::Item.from_hash('type' => 'future', 'id' => 1)
    end
  end
end

class ErrorMappingTests < Minitest::Test
  def test_http_error
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport("#{BASE}/item/1.json" => 500)
    )
    err = assert_raises(Hacker::News::HttpError) { c.item(1) }
    assert_equal 500, err.status
    assert_equal "#{BASE}/item/1.json", err.url
  end

  def test_http_404_not_conflated
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport("#{BASE}/item/1.json" => 404)
    )
    err = assert_raises(Hacker::News::HttpError) { c.item(1) }
    assert_equal 404, err.status
  end

  def test_json_error
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport("#{BASE}/item/1.json" => 'not-json')
    )
    assert_raises(Hacker::News::JsonError) { c.item(1) }
  end

  def test_timeout_error
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/item/1.json" => Hacker::News::TimeoutError.new('hn: timeout', url: 'x')
      )
    )
    assert_raises(Hacker::News::TimeoutError) { c.item(1) }
  end

  def test_transport_error
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/item/1.json" => Hacker::News::TransportError.new('hn: down', url: 'x')
      )
    )
    assert_raises(Hacker::News::TransportError) { c.item(1) }
  end

  def test_default_transport_connection_refused
    # Point at a closed port to exercise the default Net::HTTP transport + its
    # rescue paths (TransportError on ECONNREFUSED).
    c = Hacker::News::Client.new(base_url: 'http://127.0.0.1:1/v0', timeout: 0.5)
    assert_raises(Hacker::News::TransportError) { c.item(1) }
  end
end

class BatchAndHydrateTests < Minitest::Test
  def test_items_order_and_null_drop
    c = Hacker::News::Client.new(
      base_url: BASE, concurrency: 3,
      transport: fake_transport(
        "#{BASE}/item/1.json" => STORY_1,
        "#{BASE}/item/2.json" => nil,
        "#{BASE}/item/3.json" => STORY_1.merge('id' => 3)
      )
    )
    out = c.items([1, 2, 3])
    assert_equal [1, 3], out.map(&:id)
  end

  def test_items_empty
    calls = 0
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: lambda { |_url, _t, _ua|
        calls += 1
        FakeResponse.new('200', 'null')
      }
    )
    assert_equal [], c.items([])
    assert_equal 0, calls
  end

  def test_items_fail_fast
    c = Hacker::News::Client.new(
      base_url: BASE, concurrency: 2,
      transport: fake_transport(
        "#{BASE}/item/1.json" => STORY_1,
        "#{BASE}/item/99.json" => 500,
        "#{BASE}/item/2.json" => STORY_1,
        "#{BASE}/item/3.json" => STORY_1
      )
    )
    assert_raises(Hacker::News::HttpError) { c.items([1, 99, 2, 3]) }
  end

  def test_user_known_and_unknown
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/user/pg.json" => { 'id' => 'pg', 'created' => 1, 'karma' => 100,
                                    'submitted' => [1, 2] },
        "#{BASE}/user/nobody.json" => nil
      )
    )
    pg = c.user('pg')
    assert_equal 'pg', pg.id
    assert_equal [1, 2], pg.submitted
    assert_nil c.user('nobody')
  end

  def test_user_without_submitted_field
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/user/foo.json" => { 'id' => 'foo', 'created' => 1, 'karma' => 0 }
      )
    )
    u = c.user('foo')
    assert_equal [], u.submitted
  end

  def test_scalars_and_all_story_lists_plus_hydration
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport(
        "#{BASE}/maxitem.json" => 123,
        "#{BASE}/updates.json" => { 'items' => [1], 'profiles' => ['pg'] },
        "#{BASE}/topstories.json" => [1],
        "#{BASE}/newstories.json" => [1],
        "#{BASE}/beststories.json" => [],
        "#{BASE}/askstories.json" => [],
        "#{BASE}/showstories.json" => [],
        "#{BASE}/jobstories.json" => [],
        "#{BASE}/item/1.json" => STORY_1
      )
    )
    assert_equal 123, c.max_item
    assert_equal [1], c.updates.items
    assert_equal ['pg'], c.updates.profiles
    [c.top_story_ids, c.new_story_ids, c.best_story_ids,
     c.ask_story_ids, c.show_story_ids, c.job_story_ids].each do |ids|
      assert_kind_of Array, ids
    end
    assert_equal 1, c.top_stories(limit: 5).size
    assert_equal 1, c.new_stories(limit: 5).size
    assert_equal [], c.best_stories(limit: 5)
    assert_equal [], c.ask_stories(limit: 5)
    assert_equal [], c.show_stories(limit: 5)
    assert_equal [], c.job_stories(limit: 5)
  end
end

class CommentTreeTests < Minitest::Test
  def test_prunes_deleted_and_null
    c = Hacker::News::Client.new(
      base_url: BASE, concurrency: 2,
      transport: fake_transport(
        "#{BASE}/item/100.json" => {
          'id' => 100, 'type' => 'comment', 'time' => 1, 'kids' => [101, 102, 103]
        },
        "#{BASE}/item/101.json" => { 'id' => 101, 'type' => 'comment', 'time' => 1 },
        "#{BASE}/item/102.json" => {
          'id' => 102, 'type' => 'comment', 'deleted' => true, 'time' => 1
        },
        "#{BASE}/item/103.json" => nil
      )
    )
    root = c.comment_tree(100)
    assert_equal [101], root.replies.map(&:id)
  end

  def test_null_root_returns_nil
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport("#{BASE}/item/999.json" => nil)
    )
    assert_nil c.comment_tree(999)
  end

  def test_error_during_tree_fetch_propagates
    c = Hacker::News::Client.new(
      base_url: BASE,
      transport: fake_transport("#{BASE}/item/1.json" => 500)
    )
    assert_raises(Hacker::News::HttpError) { c.comment_tree(1) }
  end

  def test_semaphore_contention_concurrency_one
    # Single-permit semaphore + multiple kids forces acquire to wait — exercises
    # the ConditionVariable#wait branch inside comment_tree's acquire lambda.
    slow_transport = lambda { |url, _t, _ua|
      sleep 0.01 if url.end_with?('/item/101.json') || url.end_with?('/item/102.json')
      case url
      when "#{BASE}/item/100.json"
        FakeResponse.new('200',
                         { 'id' => 100, 'type' => 'comment', 'time' => 1, 'kids' => [101, 102] }.to_json)
      when "#{BASE}/item/101.json"
        FakeResponse.new('200', { 'id' => 101, 'type' => 'comment', 'time' => 1 }.to_json)
      when "#{BASE}/item/102.json"
        FakeResponse.new('200', { 'id' => 102, 'type' => 'comment', 'time' => 1 }.to_json)
      else
        FakeResponse.new('404', '{}')
      end
    }
    c = Hacker::News::Client.new(base_url: BASE, concurrency: 1, transport: slow_transport)
    root = c.comment_tree(100)
    assert_equal [101, 102], root.replies.map(&:id)
  end

  def test_error_during_tree_fetch_cancels_siblings
    # Trigger the `break nil if first_error` branch by raising on one kid while
    # others are still pending.
    calls = 0
    mu = Mutex.new
    t = lambda { |url, _timeout, _ua|
      mu.synchronize { calls += 1 }
      if url.end_with?('/item/100.json')
        FakeResponse.new('200',
                         { 'id' => 100, 'type' => 'comment', 'time' => 1,
                           'kids' => [101, 102, 103, 104] }.to_json)
      elsif url.end_with?('/item/101.json')
        sleep 0.02
        FakeResponse.new('200', { 'id' => 101, 'type' => 'comment', 'time' => 1 }.to_json)
      elsif url.end_with?('/item/102.json')
        FakeResponse.new('500', '{}')
      else
        sleep 0.02
        FakeResponse.new('200',
                         { 'id' => url[%r{/item/(\d+)\.json}, 1].to_i, 'type' => 'comment',
                           'time' => 1 }.to_json)
      end
    }
    c = Hacker::News::Client.new(base_url: BASE, concurrency: 4, transport: t)
    assert_raises(Hacker::News::HttpError) { c.comment_tree(100) }
  end
end
