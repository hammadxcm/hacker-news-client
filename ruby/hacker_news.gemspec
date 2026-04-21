# frozen_string_literal: true

require_relative 'lib/hacker_news/version'

Gem::Specification.new do |s|
  s.name = 'hacker_news'
  s.version = HackerNews::VERSION
  s.summary = 'Zero-dep Ruby client for the Hacker News Firebase API.'
  s.description = 'Idiomatic, stdlib-only wrapper over the Hacker News v0 API.'
  s.authors = ['hacker-news-client contributors']
  s.license = 'MIT'
  s.required_ruby_version = '>= 3.1.0'
  s.files = Dir['lib/**/*.rb', 'README.md', 'LICENSE']
  s.require_paths = ['lib']
  s.metadata['rubygems_mfa_required'] = 'true'
end
