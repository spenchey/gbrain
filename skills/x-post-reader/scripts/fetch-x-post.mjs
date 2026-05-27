#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const DEFAULT_CRED_FILE = `${process.env.HOME}/.config/openclaw/credentials/x-twitter.json`;

export function parseXPostUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid X/Twitter URL: ${input}`);
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)) {
    throw new Error(`Expected x.com or twitter.com status URL, got ${url.hostname}`);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const statusIndex = parts.findIndex((p) => p === 'status' || p === 'statuses');
  if (statusIndex < 1 || !parts[statusIndex + 1]) {
    throw new Error(`Expected /<handle>/status/<id> URL, got ${input}`);
  }

  const tweetId = parts[statusIndex + 1];
  if (!/^\d+$/.test(tweetId)) {
    throw new Error(`Invalid tweet id in URL: ${tweetId}`);
  }

  return {
    tweetId,
    handleHint: parts[0],
    canonicalUrl: `https://x.com/${parts[0]}/status/${tweetId}`,
  };
}

export function normalizeTweetPayload(payload, originalUrl) {
  const data = payload?.data;
  if (!data?.id) {
    const detail = payload?.errors?.[0]?.detail || payload?.title || 'missing data.id';
    throw new Error(`X API response did not include a tweet: ${detail}`);
  }

  const users = payload?.includes?.users || [];
  const author = users.find((u) => u.id === data.author_id) || null;
  const media = payload?.includes?.media || [];
  const referencedTweets = payload?.includes?.tweets || [];
  const longText = data.note_tweet?.text;
  const text = longText || data.text || '';
  const urlHandle = author?.username || parseXPostUrl(originalUrl).handleHint;

  return {
    id: data.id,
    url: `https://x.com/${urlHandle}/status/${data.id}`,
    original_url: originalUrl,
    created_at: data.created_at || null,
    conversation_id: data.conversation_id || null,
    text,
    short_text: data.text || text,
    is_note_tweet: Boolean(longText),
    author: author
      ? {
          id: author.id,
          name: author.name,
          username: author.username,
          verified: Boolean(author.verified),
          description: author.description || '',
          metrics: author.public_metrics || {},
        }
      : null,
    metrics: data.public_metrics || {},
    entities: data.note_tweet?.entities || data.entities || {},
    referenced_tweets: data.referenced_tweets || [],
    referenced_tweet_objects: referencedTweets,
    media,
    fetched_at: new Date().toISOString(),
  };
}

function loadBearerToken(credFile) {
  if (!existsSync(credFile)) {
    throw new Error(`Missing X credential file: ${credFile}`);
  }
  const payload = JSON.parse(readFileSync(credFile, 'utf8'));
  if (!payload.bearer_token) {
    throw new Error(`Missing bearer_token in ${credFile}`);
  }
  return payload.bearer_token;
}

function buildApiUrl(tweetId) {
  const url = new URL(`https://api.x.com/2/tweets/${tweetId}`);
  url.searchParams.set(
    'tweet.fields',
    'id,text,created_at,author_id,conversation_id,public_metrics,entities,referenced_tweets,attachments,note_tweet',
  );
  url.searchParams.set('expansions', 'author_id,referenced_tweets.id,attachments.media_keys');
  url.searchParams.set('user.fields', 'id,name,username,verified,description,public_metrics');
  url.searchParams.set('media.fields', 'media_key,type,url,preview_image_url,alt_text');
  return url;
}

export async function fetchXPost(inputUrl, opts = {}) {
  const parsed = parseXPostUrl(inputUrl);
  if (opts.mockResponse) {
    const payload = JSON.parse(readFileSync(opts.mockResponse, 'utf8'));
    return normalizeTweetPayload(payload, inputUrl);
  }

  const bearer = loadBearerToken(opts.credFile || process.env.X_CRED_FILE || DEFAULT_CRED_FILE);
  const apiUrl = buildApiUrl(parsed.tweetId);
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      'User-Agent': 'gbrain-x-post-reader/1.0',
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`X API returned non-JSON HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = payload?.detail || payload?.title || JSON.stringify(payload).slice(0, 300);
    throw new Error(`X API HTTP ${response.status}: ${detail}`);
  }
  return normalizeTweetPayload(payload, inputUrl);
}

function renderMarkdown(post) {
  const author = post.author ? `@${post.author.username} (${post.author.name})` : 'unknown author';
  const metrics = post.metrics || {};
  const parts = [
    `# X post: ${author}`,
    '',
    `Source: ${post.url}`,
    `Created: ${post.created_at || 'unknown'}`,
    `Fetched: ${post.fetched_at}`,
    '',
    post.text,
    '',
    'Metrics:',
    `- Likes: ${metrics.like_count ?? 0}`,
    `- Reposts: ${metrics.retweet_count ?? 0}`,
    `- Replies: ${metrics.reply_count ?? 0}`,
    `- Quotes: ${metrics.quote_count ?? 0}`,
    `- Bookmarks: ${metrics.bookmark_count ?? 0}`,
    `- Impressions: ${metrics.impression_count ?? 0}`,
  ];
  if (post.media?.length) {
    parts.push('', 'Media:');
    for (const item of post.media) {
      parts.push(`- ${item.type}: ${item.url || item.preview_image_url || item.media_key}`);
    }
  }
  return parts.join('\n');
}

function parseArgs(argv) {
  const out = { json: true, credFile: null, mockResponse: null, url: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--markdown') out.json = false;
    else if (arg === '--cred-file') out.credFile = argv[++i];
    else if (arg === '--mock-response') out.mockResponse = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: ${basename(process.argv[1])} <x-status-url> [--json|--markdown] [--cred-file PATH] [--mock-response PATH]`);
      process.exit(0);
    } else if (!out.url) {
      out.url = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!out.url) throw new Error('Missing X/Twitter status URL');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const post = await fetchXPost(args.url, args);
    console.log(args.json ? JSON.stringify(post, null, 2) : renderMarkdown(post));
  } catch (err) {
    console.error(`fetch-x-post: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
