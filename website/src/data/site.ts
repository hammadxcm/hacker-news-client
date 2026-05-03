export const site = {
  name: 'hacker-news-client',
  shortName: 'hn-client',
  tagline: 'One design contract. Six idiomatic libraries. Zero surprises.',
  description:
    'A multi-language SDK for the Hacker News Firebase API — JavaScript, TypeScript, Python, Ruby, Go, and Rust clients sharing one wire contract, one mock server, and one cross-language verification harness.',
  repo: 'https://github.com/hammadxcm/hacker-news-client',
  repoOwner: 'hammadxcm',
  repoName: 'hacker-news-client',
  license: 'MIT',
  designContractUrl: 'https://github.com/hammadxcm/hacker-news-client/blob/main/DESIGN.md',
  hnApiUrl: 'https://github.com/HackerNews/API',
} as const;

export type Site = typeof site;
