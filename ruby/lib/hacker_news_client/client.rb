# frozen_string_literal: true

require 'json'
require 'net/http'
require 'uri'

module HackerNewsClient
  # Client for the Hacker News Firebase API.
  #
  # @example
  #   client = HackerNewsClient::Client.new
  #   item = client.item(1)
  #   puts item.title if item.is_a?(HackerNewsClient::Story)
  class Client
    DEFAULT_BASE_URL = 'https://hacker-news.firebaseio.com/v0'
    DEFAULT_TIMEOUT = 10.0
    DEFAULT_CONCURRENCY = 10
    DEFAULT_USER_AGENT = "hn-client-ruby/#{VERSION}".freeze
    DEFAULT_STORIES_LIMIT = 30

    attr_reader :base_url, :timeout, :concurrency, :user_agent

    # @param base_url [String, nil] overrides the API root. Defaults to ENV['HN_BASE'] or the Firebase URL.
    # @param timeout [Numeric] per-request budget in seconds.
    # @param concurrency [Integer] batch fan-out cap.
    # @param user_agent [String]
    # @param transport [#call, nil] optional callable +transport.call(url, timeout, user_agent)+
    #   returning an object responding to +.code+ and +.body+. Used in tests to mock HTTP.
    def initialize(base_url: nil, timeout: DEFAULT_TIMEOUT, concurrency: DEFAULT_CONCURRENCY,
                   user_agent: DEFAULT_USER_AGENT, transport: nil)
      # Treat HN_BASE="" as unset (common in .env files).
      env_base = ENV.fetch('HN_BASE', nil)
      env_base = nil if env_base && env_base.empty?
      @base_url = (base_url || env_base || DEFAULT_BASE_URL).sub(%r{/+$}, '')
      # Reject obviously-wrong timeout / concurrency values so users get a
      # default instead of a hang (timeout ≤ 0) or an empty-batch silent
      # failure (concurrency ≤ 0).
      @timeout = timeout.positive? ? timeout : DEFAULT_TIMEOUT
      @concurrency = concurrency.positive? ? concurrency : DEFAULT_CONCURRENCY
      @user_agent = user_agent
      @transport = transport
    end

    # Fetch a single item.
    # @param id [Integer]
    # @return [Item, nil] +nil+ for unknown ids and deleted stubs.
    # @raise [HackerNewsClient::Error] on HTTP / transport / decode failure.
    def item(id)
      body = get_json("/item/#{id}.json")
      return nil if body.nil?
      return nil if body.is_a?(Hash) && body['deleted'] == true

      Item.from_hash(body)
    end

    # Fetch many items with bounded concurrency. Fail-fast: any error aborts
    # remaining fetches and is re-raised.
    # @param ids [Array<Integer>]
    # @return [Array<Item>] nulls/deleted dropped; surviving order preserved.
    def items(ids)
      return [] if ids.empty?

      results = Array.new(ids.size)
      first_error = nil
      mutex = Mutex.new
      queue = Queue.new
      ids.each_with_index { |id, i| queue.push([i, id]) }
      queue.close

      workers = Array.new([@concurrency, ids.size].min) do
        Thread.new do
          loop do
            pair = queue.pop
            break if pair.nil?
            break if mutex.synchronize { first_error }

            i, id = pair
            begin
              results[i] = item(id)
            rescue StandardError => e
              mutex.synchronize { first_error ||= e }
              break
            end
          end
        end
      end
      workers.each(&:join)
      raise first_error if first_error

      results.compact
    end

    # Fetch a user profile. +nil+ for unknown users.
    # @param username [String]
    # @return [User, nil]
    def user(username)
      body = get_json("/user/#{username}.json")
      return nil if body.nil?

      User.from_hash(body)
    end

    # @return [Integer] current largest item id.
    def max_item
      body = get_json('/maxitem.json')
      raise JsonError, "hn: maxitem expected Integer, got #{body.class}" unless body.is_a?(Integer)

      body
    end

    # @return [Updates]
    def updates
      body = get_json('/updates.json')
      raise JsonError, "hn: updates expected Hash, got #{body.class}" unless body.is_a?(Hash)

      Updates.new(items: body['items'] || [], profiles: body['profiles'] || [])
    end

    # @return [Array<Integer>]
    def top_story_ids = id_list('/topstories.json')
    # @return [Array<Integer>]
    def new_story_ids = id_list('/newstories.json')
    # @return [Array<Integer>]
    def best_story_ids = id_list('/beststories.json')
    # @return [Array<Integer>]
    def ask_story_ids = id_list('/askstories.json')
    # @return [Array<Integer>]
    def show_story_ids = id_list('/showstories.json')
    # @return [Array<Integer>]
    def job_story_ids = id_list('/jobstories.json')

    # @param limit [Integer]
    # @return [Array<Item>]
    def top_stories(limit: DEFAULT_STORIES_LIMIT)  = hydrate(top_story_ids, limit)
    # @param limit [Integer]
    # @return [Array<Item>]
    def new_stories(limit: DEFAULT_STORIES_LIMIT)  = hydrate(new_story_ids, limit)
    # @param limit [Integer]
    # @return [Array<Item>]
    def best_stories(limit: DEFAULT_STORIES_LIMIT) = hydrate(best_story_ids, limit)
    # @param limit [Integer]
    # @return [Array<Item>]
    def ask_stories(limit: DEFAULT_STORIES_LIMIT)  = hydrate(ask_story_ids, limit)
    # @param limit [Integer]
    # @return [Array<Item>]
    def show_stories(limit: DEFAULT_STORIES_LIMIT) = hydrate(show_story_ids, limit)
    # @param limit [Integer]
    # @return [Array<Item>]
    def job_stories(limit: DEFAULT_STORIES_LIMIT)  = hydrate(job_story_ids, limit)

    # Recursively fetch a comment tree rooted at +id+. Uses one global
    # SizedQueue-based semaphore bounding in-flight HTTP requests. Deleted
    # nodes pruned. Fails fast.
    #
    # Fan-out uses a bounded worker pool to prevent unbounded Thread creation
    # on large trees (a story with 500 top-level kids × 50 replies each
    # previously spawned 25k+ threads).
    # @param id [Integer]
    # @return [CommentTreeNode, nil]
    def comment_tree(id)
      sem = SizedQueue.new(@concurrency) # acts as counting semaphore
      first_error = nil
      err_mutex = Mutex.new
      cancelled = false

      record_error = lambda do |exc|
        err_mutex.synchronize do
          first_error ||= exc
          cancelled = true
        end
      end

      visit = lambda do |node_id|
        # Fail-fast short-circuit: don't start new work if a peer errored.
        break nil if err_mutex.synchronize { cancelled }

        # Acquire semaphore slot only for the HTTP call itself. Release
        # BEFORE recursing into children so we never hold a permit across
        # a wait for descendants (that path is the deadlock we fixed in Go).
        sem.push(:slot)
        body = nil
        begin
          body = get_json("/item/#{node_id}.json")
        rescue StandardError => e
          record_error.call(e)
          break nil
        ensure
          sem.pop
        end
        break nil if body.nil? || (body.is_a?(Hash) && body['deleted'] == true)

        kids = body['kids'] || []
        # Parallel kid fetch via a throwaway Thread-per-kid — this is fine
        # because the semaphore above limits concurrent HTTP. Threads that
        # never acquire stay cheap and exit quickly.
        replies = kids.map { |k| Thread.new { visit.call(k) } }.map(&:value).compact

        CommentTreeNode.new(
          {
            'id' => body['id'],
            'type' => 'comment',
            'by' => body['by'],
            'time' => body['time'],
            'parent' => body['parent'],
            'text' => body['text'],
            'dead' => body['dead'] == true,
            'kids' => kids
          },
          replies: replies
        )
      end

      root = visit.call(id)
      raise first_error if first_error

      root
    end

    private

    # @return [Object] decoded JSON (Hash / Array / Numeric / String / NilClass).
    def get_json(path)
      url = "#{@base_url}#{path}"
      res = @transport ? @transport.call(url, @timeout, @user_agent) : default_transport(url)
      code = res.code.to_i
      raise HttpError.new("hn: http #{code}", url: url, status: code) if code >= 400

      JSON.parse(res.body)
    rescue JSON::ParserError => e
      raise JsonError.new("hn: invalid json: #{e.message}", url: url)
    end

    # @return [Net::HTTPResponse] real HTTP response object.
    def default_transport(url)
      # Enforce a TOTAL timeout budget (connect + read combined) rather than
      # per-op. Net::HTTP applies open_timeout and read_timeout separately,
      # so open(10s) + read(10s) = 20s worst case. Timeout.timeout wraps the
      # whole request, raising Timeout::Error once the wall-clock elapses.
      require 'timeout'
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = @timeout
      http.read_timeout = @timeout
      req = Net::HTTP::Get.new(uri.request_uri)
      req['User-Agent'] = @user_agent
      Timeout.timeout(@timeout) { http.request(req) }
      # Net::OpenTimeout and Net::ReadTimeout both inherit from Timeout::Error,
      # so listing them together would shadow. Catch the parent only.
    rescue Timeout::Error
      raise TimeoutError.new('hn: timeout', url: url)
    rescue SocketError, Errno::ECONNREFUSED, Errno::ECONNRESET, Errno::EHOSTUNREACH => e
      raise TransportError.new("hn: transport: #{e.message}", url: url)
    end

    def id_list(path)
      body = get_json(path)
      unless body.is_a?(Array)
        raise JsonError.new("hn: #{path} expected Array, got #{body.class}",
                            url: "#{@base_url}#{path}")
      end

      body
    end

    def hydrate(ids, limit)
      items(ids.first(limit))
    end
  end
end
