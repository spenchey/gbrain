import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  fetchXPost,
  normalizeTweetPayload,
  parseXPostUrl,
} from '../skills/x-post-reader/scripts/fetch-x-post.mjs';

const samplePayload = {
  data: {
    id: '2059113412278227328',
    author_id: '1603551009854423040',
    created_at: '2026-05-26T03:24:28.000Z',
    conversation_id: '2059113412278227328',
    text: 'truncated preview https://t.co/example',
    note_tweet: {
      text: 'Full long-form note tweet text',
      entities: {
        urls: [
          {
            expanded_url: 'https://arxiv.org/pdf/2605.23904',
          },
        ],
      },
    },
    public_metrics: {
      retweet_count: 216,
      reply_count: 43,
      like_count: 2087,
      quote_count: 38,
      bookmark_count: 4756,
      impression_count: 704527,
    },
    attachments: { media_keys: ['3_2059089470649966592'] },
  },
  includes: {
    users: [
      {
        id: '1603551009854423040',
        name: 'Muratcan Koylan',
        username: 'koylanai',
        verified: false,
        description: 'Member of Technical Staff',
        public_metrics: { followers_count: 21400 },
      },
    ],
    media: [
      {
        type: 'photo',
        media_key: '3_2059089470649966592',
        url: 'https://pbs.twimg.com/media/example.jpg',
      },
    ],
  },
};

describe('x-post-reader', () => {
  test('parses canonical and mobile X/Twitter status URLs', () => {
    expect(parseXPostUrl('https://x.com/koylanai/status/2059113412278227328?s=46')).toEqual({
      tweetId: '2059113412278227328',
      handleHint: 'koylanai',
      canonicalUrl: 'https://x.com/koylanai/status/2059113412278227328',
    });

    expect(parseXPostUrl('https://mobile.twitter.com/garrytan/statuses/2042925773300908103').tweetId).toBe(
      '2042925773300908103',
    );
  });

  test('rejects non-status URLs instead of guessing', () => {
    expect(() => parseXPostUrl('https://example.com/koylanai/status/1')).toThrow(/Expected x.com/);
    expect(() => parseXPostUrl('https://x.com/koylanai')).toThrow('Expected /<handle>/status/<id>');
    expect(() => parseXPostUrl('https://x.com/koylanai/status/not-an-id')).toThrow(/Invalid tweet id/);
  });

  test('prefers note_tweet text and canonicalizes with fetched author', () => {
    const normalized = normalizeTweetPayload(samplePayload, 'https://x.com/someone/status/2059113412278227328?s=46');
    expect(normalized.text).toBe('Full long-form note tweet text');
    expect(normalized.short_text).toBe('truncated preview https://t.co/example');
    expect(normalized.is_note_tweet).toBe(true);
    expect(normalized.url).toBe('https://x.com/koylanai/status/2059113412278227328');
    expect(normalized.author?.username).toBe('koylanai');
    expect(normalized.metrics.bookmark_count).toBe(4756);
    expect(normalized.media[0].url).toContain('pbs.twimg.com');
  });

  test('fetchXPost supports mock responses for integration-free smoke tests', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'x-post-reader-'));
    const mockPath = join(dir, 'tweet.json');
    writeFileSync(mockPath, JSON.stringify(samplePayload), 'utf8');

    const post = await fetchXPost('https://x.com/koylanai/status/2059113412278227328', {
      mockResponse: mockPath,
    });

    expect(post.id).toBe('2059113412278227328');
    expect(post.text).toBe('Full long-form note tweet text');
  });
});
