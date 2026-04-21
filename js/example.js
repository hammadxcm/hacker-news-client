#!/usr/bin/env node
/**
 * @file Runnable example hitting the live Hacker News API.
 * @example
 *   node example.js
 */
import { HackerNewsClient } from './src/index.js';

const client = new HackerNewsClient();

const topIds = await client.topStoryIds();
console.log(`Currently tracking ${topIds.length} top stories.`);

const topFive = await client.topStories(5);
for (const story of topFive) {
  console.log(`• ${story.title} — ${story.by} (${story.score} points)`);
}

const max = await client.maxItem();
console.log(`\nCurrent max item id: ${max}`);
