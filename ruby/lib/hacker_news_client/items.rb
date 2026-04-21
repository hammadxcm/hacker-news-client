# frozen_string_literal: true

module HackerNewsClient
  # Sum-type root class. Concrete subclasses: Story, Comment, Job, Poll, PollOpt.
  # Use +from_hash+ to build the right subclass from a decoded API payload.
  #
  # @example
  #   item = HackerNewsClient::Item.from_hash(api_payload)
  #   case item
  #   when HackerNewsClient::Story then item.title
  #   when HackerNewsClient::Comment then item.text
  #   end
  class Item
    # Common fields on every variant.
    # @!attribute [r] id
    #   @return [Integer]
    # @!attribute [r] type
    #   @return [String] one of "story" / "comment" / "job" / "poll" / "pollopt".
    attr_reader :id, :type, :by, :time, :dead

    # @param data [Hash{String, Symbol => Object}] decoded API payload.
    def initialize(data)
      h = data.transform_keys(&:to_s)
      @id = h["id"]
      @type = h["type"]
      @by = h["by"]
      @time = h["time"]
      @dead = h["dead"] == true
      assign(h)
    end

    # Build the matching Item subclass from a decoded API payload.
    # @param data [Hash] decoded API payload.
    # @return [Item]
    # @raise [ArgumentError] if the +type+ field is missing or unknown.
    def self.from_hash(data)
      kind = data["type"] || data[:type]
      case kind
      when "story"   then Story.new(data)
      when "comment" then Comment.new(data)
      when "job"     then Job.new(data)
      when "poll"    then Poll.new(data)
      when "pollopt" then PollOpt.new(data)
      else raise ArgumentError, "unknown item type: #{kind.inspect}"
      end
    end

    # @abstract override in subclasses to unpack variant-specific fields.
    def assign(_h); end
  end

  # A submitted HN story.
  class Story < Item
    attr_reader :title, :score, :descendants, :url, :text, :kids

    def assign(h)
      @title = h["title"]
      @score = h["score"]
      @descendants = h["descendants"]
      @url = h["url"]
      @text = h["text"]
      @kids = h["kids"] || []
    end
  end

  # A comment on a story, poll, or parent comment.
  class Comment < Item
    attr_reader :parent, :text, :kids

    def assign(h)
      @parent = h["parent"]
      @text = h["text"]
      @kids = h["kids"] || []
    end
  end

  # A YC-posted job listing.
  class Job < Item
    attr_reader :title, :score, :url, :text

    def assign(h)
      @title = h["title"]
      @score = h["score"]
      @url = h["url"]
      @text = h["text"]
    end
  end

  # A multiple-choice poll. +parts+ lists the PollOpt ids in display order.
  class Poll < Item
    attr_reader :title, :score, :descendants, :parts, :text, :kids

    def assign(h)
      @title = h["title"]
      @score = h["score"]
      @descendants = h["descendants"]
      @parts = h["parts"] || []
      @text = h["text"]
      @kids = h["kids"] || []
    end
  end

  # A single option under a Poll. +poll+ is the parent Poll id.
  class PollOpt < Item
    attr_reader :poll, :score, :text

    def assign(h)
      @poll = h["poll"]
      @score = h["score"]
      @text = h["text"]
    end
  end

  # A HN user profile.
  # @!attribute [r] id
  #   @return [String] case-sensitive username.
  User = Struct.new(:id, :created, :karma, :about, :submitted, keyword_init: true) do
    # @param h [Hash]
    # @return [User]
    def self.from_hash(h)
      new(
        id: h["id"],
        created: h["created"],
        karma: h["karma"],
        about: h["about"],
        submitted: h["submitted"] || []
      )
    end
  end

  # The +/updates+ endpoint record.
  Updates = Struct.new(:items, :profiles, keyword_init: true)

  # A comment tree node with recursively-fetched replies.
  CommentTreeNode = Struct.new(:id, :by, :time, :parent, :text, :dead, :kids, :replies, keyword_init: true)
end
