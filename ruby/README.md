# hacker-news-client (Ruby)

[![Gem version](https://img.shields.io/gem/v/hacker-news-client.svg?style=flat-square&logo=rubygems&logoColor=white)](https://rubygems.org/gems/hacker-news-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Ruby](https://img.shields.io/badge/ruby-%E2%89%A53.1-CC342D?style=flat-square&logo=ruby&logoColor=white)](https://www.ruby-lang.org)
[![Coverage](https://img.shields.io/badge/line--coverage-100%25-brightgreen.svg?style=flat-square)](#tests)

Zero-dependency Ruby gem for the [Hacker News Firebase API](https://github.com/HackerNews/API). Pure stdlib (`Net::HTTP` + `Thread` + `Queue`). Class-per-variant item modeling with polymorphic `from_hash` factory. Part of the [cross-language `hacker-news-client` suite](../README.md).

## Install

```bash
gem install hacker-news-client
```

Or add to your `Gemfile`:

```ruby
gem 'hacker-news-client', '~> 0.1.0'
```

## Usage

```ruby
require 'hacker/news/client'

client = Hacker::News::Client.new

# Single item
item = client.item(1)
puts item.title if item.is_a?(Hacker::News::Story)

# Case on variant (Ruby 3.0+ pattern matching)
case item
in Hacker::News::Story(title:, score:)   then puts "#{title} (#{score})"
in Hacker::News::Comment(text:, parent:) then puts "comment on #{parent}"
in nil                                   then puts 'deleted or missing'
end

# Batch
items = client.items([1, 15, 100])

# Top stories, hydrated
top = client.top_stories(limit: 10)

# Recursive comment tree
tree = client.comment_tree(8863)

# User profile
user = client.user('pg')
```

## Configuration

```ruby
Hacker::News::Client.new(
  base_url: 'https://hacker-news.firebaseio.com/v0',   # default
  timeout: 10.0,                                         # seconds
  concurrency: 10,                                       # batch fan-out cap
  user_agent: 'my-app/1.0',
  transport: ->(url, timeout, ua) { ... }                # optional, for tests
)
```

The `transport:` lambda is the injection point for mocking — see [`test/test_unit.rb`](./test/test_unit.rb) for the pattern.

## Error handling

```ruby
begin
  client.item(1)
rescue Hacker::News::HttpError => err
  warn "HTTP #{err.status} at #{err.url}"
rescue Hacker::News::TimeoutError
  warn 'timed out'
rescue Hacker::News::TransportError => err
  warn "network: #{err.message}"
rescue Hacker::News::JsonError
  warn 'invalid JSON'
rescue Hacker::News::Error => err
  warn err.message
end
```

`nil` from `item` / `user` means the API returned `null` — not an error. Deleted stubs also surface as `nil`.

## Item variants

```ruby
Hacker::News::Item          # abstract base
  ├─ Hacker::News::Story    # title, score, descendants, url, text, kids
  ├─ Hacker::News::Comment  # parent, text, kids
  ├─ Hacker::News::Job      # title, score, url, text
  ├─ Hacker::News::Poll     # title, score, descendants, parts, text, kids
  └─ Hacker::News::PollOpt  # poll, score, text
```

`Hacker::News::Item.from_hash(h)` builds the matching subclass from a decoded payload.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md). Methods are `snake_case`:

| Method | Returns |
|---|---|
| `item(id)` | `Item` or `nil` |
| `items(ids)` | `Array<Item>` — order-preserving, nils dropped |
| `user(username)` | `User` (Struct) or `nil` |
| `max_item` | `Integer` |
| `updates` | `Updates` (Struct) |
| `top_story_ids` / `new_story_ids` / `best_story_ids` / `ask_story_ids` / `show_story_ids` / `job_story_ids` | `Array<Integer>` |
| `top_stories(limit: 30)` / ... | hydrated `Array<Item>` |
| `comment_tree(id)` | `CommentTreeNode` (Struct) or `nil` |

## Tests

```bash
cd ruby
bundle install
rake test              # 41 tests: 16 integration + 25 unit
rubocop                # lint
```

Coverage: 100% line / 96.96% branch via [SimpleCov](https://github.com/simplecov-ruby/simplecov).

## Example

[`example.rb`](./example.rb):

```bash
ruby example.rb
```

## Links

- [Main repo README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [CONTRIBUTING](../CONTRIBUTING.md)
- [DESIGN.md](../DESIGN.md)

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
