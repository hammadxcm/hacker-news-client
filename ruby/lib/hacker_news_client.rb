# frozen_string_literal: true

# Zero-dep Ruby client for the Hacker News Firebase API.
#
# @example
#   require "hacker_news_client"
#   client = HackerNewsClient::Client.new
#   item = client.item(1)
module HackerNewsClient
end

require_relative "hacker_news_client/version"
require_relative "hacker_news_client/errors"
require_relative "hacker_news_client/items"
require_relative "hacker_news_client/client"
