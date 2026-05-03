export const en = {
  'nav.features': 'Features',
  'nav.install': 'Install',
  'nav.api': 'API',
  'nav.compare': 'Compare',
  'nav.github': 'GitHub',

  'hero.eyebrow': 'Multi-language SDK',
  'hero.title': 'One contract.\nSix idiomatic libraries.',
  'hero.subtitle':
    'A production-grade Hacker News API client for JavaScript, TypeScript, Python, Ruby, Go, and Rust — sharing one wire contract, one mock server, and one cross-language verification harness.',
  'hero.cta.install': 'Get started',
  'hero.cta.github': 'View on GitHub',

  'stats.languages': 'Languages',
  'stats.contract': 'Wire contract',
  'stats.tests': 'Cross-language tests',
  'stats.license': 'License',

  'features.title': 'Built once. Verified everywhere.',
  'features.subtitle': 'Every client is idiomatic in its own language and identical at the wire.',
  'features.idiomatic.title': 'Idiomatic by language',
  'features.idiomatic.body':
    'Each client embraces its language: snake_case in Python, camelCase in JS/TS, generics in Rust, contexts in Go.',
  'features.contract.title': 'One locked contract',
  'features.contract.body':
    'A single DESIGN.md file defines every endpoint, parameter, and error. Drift is impossible.',
  'features.mock.title': 'Shared mock server',
  'features.mock.body':
    'A single Node mock fixture serves all six client test suites — same payloads, same edge cases.',
  'features.verify.title': 'Cross-language harness',
  'features.verify.body':
    'One bash script runs every test suite. Pre-push gate refuses drift between languages.',
  'features.zero.title': 'Zero runtime deps',
  'features.zero.body':
    'JS and Python ship with no transitive dependencies. Rust uses async-std/tokio, Go uses stdlib only.',
  'features.types.title': 'Strong types everywhere',
  'features.types.body':
    'TypeScript strict mode, Python typing, Rust ownership, Go interfaces, Ruby type-checked tests.',

  'install.title': 'Install in your language',
  'install.subtitle': 'Pick a language. Copy. Run. Get a Hacker News story in three lines.',
  'install.copy': 'Copy',
  'install.copied': 'Copied',

  'api.title': 'Same API, six languages',
  'api.subtitle':
    'The contract is locked at the wire layer — every client surfaces identical methods.',

  'compare.title': 'Why a wrapper?',
  'compare.subtitle':
    'The Firebase REST API is fine for one-offs. For real apps, you want types, retries, and a mock server.',
  'compare.before.title': 'Direct Firebase REST',
  'compare.before.line1': 'Hand-roll fetch + JSON parsing',
  'compare.before.line2': 'No types — runtime surprises',
  'compare.before.line3': 'No retry, no rate-limit handling',
  'compare.before.line4': 'Mock the API yourself for tests',
  'compare.after.title': 'With hn-api-client',
  'compare.after.line1': 'One method per endpoint',
  'compare.after.line2': 'Strict types in every language',
  'compare.after.line3': 'Built-in retry & timeout',
  'compare.after.line4': 'Bundled mock server, free',

  'footer.tagline': 'A multi-language SDK for the Hacker News API. MIT licensed.',
  'footer.docs': 'Documentation',
  'footer.design': 'Design contract',
  'footer.repo': 'Repository',
  'footer.api': 'HN API docs',
  'footer.copyright': '© 2026 hammadxcm. Released under the MIT License.',

  'theme.toggle': 'Toggle theme',
  'lang.switch': 'Language',
} as const;

export type TranslationKey = keyof typeof en;
export type TranslationDict = Record<TranslationKey, string>;
