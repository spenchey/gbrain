export interface XPostUrlParts {
  tweetId: string;
  handleHint: string;
  canonicalUrl: string;
}

export interface XPostAuthor {
  id: string;
  name: string;
  username: string;
  verified: boolean;
  description: string;
  metrics: Record<string, unknown>;
}

export interface XPost {
  id: string;
  url: string;
  original_url: string;
  created_at: string | null;
  conversation_id: string | null;
  text: string;
  short_text: string;
  is_note_tweet: boolean;
  author: XPostAuthor | null;
  metrics: Record<string, unknown>;
  entities: Record<string, unknown>;
  referenced_tweets: unknown[];
  referenced_tweet_objects: unknown[];
  media: Array<Record<string, unknown>>;
  fetched_at: string;
}

export function parseXPostUrl(input: string): XPostUrlParts;
export function normalizeTweetPayload(payload: unknown, originalUrl: string): XPost;
export function fetchXPost(
  inputUrl: string,
  opts?: {
    credFile?: string;
    mockResponse?: string;
  },
): Promise<XPost>;
