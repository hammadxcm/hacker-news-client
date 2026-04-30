#!/usr/bin/env ruby
# frozen_string_literal: true

# Runnable example hitting the live Hacker News API.
#
# Run: ruby example.rb

$LOAD_PATH.unshift File.expand_path('lib', __dir__)
require 'hacker/news/client'

client = Hacker::News::Client.new
client.top_stories(limit: 5).each do |item|
  next unless item.is_a?(Hacker::News::Story)

  puts "• #{item.title} — #{item.by} (#{item.score} points)"
end
