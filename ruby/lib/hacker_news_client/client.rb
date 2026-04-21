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
    def initialize(base_url: nil, timeout: DEFAULT_TIMEOUT, concurrency: DEFAULT_CONCURRENCY,
                   user_agent: DEFAULT_USER_AGENT)
      @base_url = (base_url || ENV['HN_BASE'] || DEFAULT_BASE_URL).sub(%r{/+$}, '')
      @timeout = timeout
      @concurrency = concurrency
      @user_agent = user_agent
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
      get_json('/maxitem.json')
    end

    # @return [Updates]
    def updates
      body = get_json('/updates.json')
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

    # Recursively fetch a comment tree rooted at +id+. Uses one global semaphore
    # across the whole tree. Deleted nodes pruned. Fails fast.
    # @param id [Integer]
    # @return [CommentTreeNode, nil]
    def comment_tree(id)
      sem_mutex = Mutex.new
      sem_cv = ConditionVariable.new
      sem_count = @concurrency
      first_error = nil

      acquire = lambda do
        sem_mutex.synchronize do
          sem_cv.wait(sem_mutex) while sem_count <= 0 && first_error.nil?
          sem_count -= 1 if first_error.nil?
        end
      end
      release = lambda do
        sem_mutex.synchronize do
          sem_count += 1
          sem_cv.signal
        end
      end

      visit = lambda do |node_id|
        break nil if sem_mutex.synchronize { first_error }

        acquire.call
        body = nil
        begin
          body = get_json("/item/#{node_id}.json")
        rescue StandardError => e
          sem_mutex.synchronize do
            first_error ||= e
            sem_cv.broadcast
          end
          break nil
        ensure
          release.call
        end
        break nil if body.nil? || (body.is_a?(Hash) && body['deleted'] == true)

        kids = body['kids'] || []
        replies = kids.map { |k| Thread.new { visit.call(k) } }.map(&:value).compact
        CommentTreeNode.new(
          id: body['id'],
          by: body['by'],
          time: body['time'],
          parent: body['parent'],
          text: body['text'],
          dead: body['dead'] == true,
          kids: kids,
          replies: replies
        )
      end

      root = visit.call(id)
      raise first_error if first_error

      root
    end

    private

    # @return [Object] decoded JSON (can be Hash / Array / Numeric / String / NilClass).
    def get_json(path)
      url = "#{@base_url}#{path}"
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == 'https'
      http.open_timeout = @timeout
      http.read_timeout = @timeout
      begin
        req = Net::HTTP::Get.new(uri.request_uri)
        req['User-Agent'] = @user_agent
        res = http.request(req)
      rescue Net::OpenTimeout, Net::ReadTimeout
        raise TimeoutError.new('hn: timeout', url: url)
      rescue SocketError, Errno::ECONNREFUSED, Errno::ECONNRESET, Errno::EHOSTUNREACH => e
        raise TransportError.new("hn: transport: #{e.message}", url: url)
      end
      code = res.code.to_i
      raise HttpError.new("hn: http #{code}", url: url, status: code) if code >= 400

      raw = res.body
      JSON.parse(raw)
    rescue JSON::ParserError => e
      raise JsonError.new("hn: invalid json: #{e.message}", url: url)
    end

    def id_list(path)
      body = get_json(path)
      Array(body)
    end

    def hydrate(ids, limit)
      items(ids.first(limit))
    end
  end
end
