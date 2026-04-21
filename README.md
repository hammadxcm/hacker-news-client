# hacker-news-client

A cohesive, production-quality client suite for the official [Hacker News Firebase API](https://github.com/HackerNews/API) in six languages.

- `js/` — zero-dep, Node 20+ ESM
- `ts/` — strict, discriminated unions, typed errors
- `python/` — stdlib `urllib` + optional `httpx` async extra
- `ruby/` — stdlib `Net::HTTP` gem
- `go/` — stdlib `net/http`, idiomatic package layout
- `rust/` — async on tokio + reqwest + serde + thiserror

Every implementation exposes the same conceptual API, behaves identically against the wire protocol, and is idiomatic in its own language.

See:
- [`RESEARCH.md`](./RESEARCH.md) — API reference, verdicts, prior-art survey
- [`DESIGN.md`](./DESIGN.md) — the cross-language contract every library implements

## Status

`v0.1.0` — under active development. Feature matrix and per-language quick-starts land with the verification harness in the final pass.

## License

MIT. See [`LICENSE`](./LICENSE).
