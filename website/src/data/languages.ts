export type LanguageId = 'js' | 'ts' | 'python' | 'ruby' | 'go' | 'rust';

export interface LanguageInfo {
  id: LanguageId;
  name: string;
  iconColor: string;
  packageName: string;
  registry: string;
  registryUrl: string;
  installCommand: string;
  importSnippet: string;
  usageSnippet: string;
  repoPath: string;
}

export const languages: LanguageInfo[] = [
  {
    id: 'js',
    name: 'JavaScript',
    iconColor: '#f7df1e',
    packageName: '@hammadxcm/hn-api-client-js',
    registry: 'npm',
    registryUrl: 'https://www.npmjs.com/package/@hammadxcm/hn-api-client-js',
    installCommand: 'npm install @hammadxcm/hn-api-client-js',
    importSnippet: "import { Client } from '@hammadxcm/hn-api-client-js';",
    usageSnippet: `import { Client } from '@hammadxcm/hn-api-client-js';

const hn = new Client();
const story = await hn.item(8863);
console.log(story.title);`,
    repoPath: 'js',
  },
  {
    id: 'ts',
    name: 'TypeScript',
    iconColor: '#3178c6',
    packageName: '@hammadxcm/hn-api-client-ts',
    registry: 'npm',
    registryUrl: 'https://www.npmjs.com/package/@hammadxcm/hn-api-client-ts',
    installCommand: 'npm install @hammadxcm/hn-api-client-ts',
    importSnippet: "import { Client } from '@hammadxcm/hn-api-client-ts';",
    usageSnippet: `import { Client, type Story } from '@hammadxcm/hn-api-client-ts';

const hn = new Client();
const story: Story = await hn.item(8863);
console.log(story.title);`,
    repoPath: 'ts',
  },
  {
    id: 'python',
    name: 'Python',
    iconColor: '#3776ab',
    packageName: 'hn-api-client',
    registry: 'PyPI',
    registryUrl: 'https://pypi.org/project/hn-api-client/',
    installCommand: 'pip install hn-api-client',
    importSnippet: 'from hn_api_client import Client',
    usageSnippet: `from hn_api_client import Client

hn = Client()
story = hn.item(8863)
print(story.title)`,
    repoPath: 'python',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    iconColor: '#cc342d',
    packageName: 'hacker-news-client',
    registry: 'RubyGems',
    registryUrl: 'https://rubygems.org/gems/hacker-news-client',
    installCommand: 'gem install hacker-news-client',
    importSnippet: "require 'hacker-news-client'",
    usageSnippet: `require 'hacker-news-client'

hn = Hacker::News::Client.new
story = hn.item(8863)
puts story.title`,
    repoPath: 'ruby',
  },
  {
    id: 'go',
    name: 'Go',
    iconColor: '#00add8',
    packageName: 'github.com/hammadxcm/hacker-news-client/go',
    registry: 'pkg.go.dev',
    registryUrl: 'https://pkg.go.dev/github.com/hammadxcm/hacker-news-client/go',
    installCommand: 'go get github.com/hammadxcm/hacker-news-client/go',
    importSnippet: 'import hn "github.com/hammadxcm/hacker-news-client/go"',
    usageSnippet: `package main

import (
  "context"
  "fmt"
  hn "github.com/hammadxcm/hacker-news-client/go"
)

func main() {
  client := hn.NewClient(nil)
  story, _ := client.Item(context.Background(), 8863)
  fmt.Println(story.Title)
}`,
    repoPath: 'go',
  },
  {
    id: 'rust',
    name: 'Rust',
    iconColor: '#dea584',
    packageName: 'hacker-news-client',
    registry: 'crates.io',
    registryUrl: 'https://crates.io/crates/hacker-news-client',
    installCommand: 'cargo add hacker-news-client',
    importSnippet: 'use hacker_news_client::Client;',
    usageSnippet: `use hacker_news_client::Client;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
  let hn = Client::new();
  let story = hn.item(8863).await?;
  println!("{}", story.title);
  Ok(())
}`,
    repoPath: 'rust',
  },
];

export const languageById = Object.fromEntries(languages.map((lang) => [lang.id, lang])) as Record<
  LanguageId,
  LanguageInfo
>;
