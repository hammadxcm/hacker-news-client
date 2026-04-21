# frozen_string_literal: true

# Zero-dep Ruby client for the Hacker News Firebase API.
#
# @example
#   require "hacker_news"
#   client = HackerNews::Client.new
#   item = client.item(1)
module HackerNews
end

require_relative 'hacker_news/version'
require_relative 'hacker_news/errors'
require_relative 'hacker_news/items'
require_relative 'hacker_news/client'
