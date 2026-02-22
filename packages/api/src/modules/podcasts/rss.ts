/**
 * Minimal RSS/Atom feed parser.
 * Parses feed XML and extracts episode metadata.
 */

export type FeedMeta = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  language: string | null;
};

export type FeedEpisode = {
  guid: string;
  title: string;
  description: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  duration: number | null;
};

export type ParsedFeed = {
  meta: FeedMeta;
  episodes: FeedEpisode[];
};

/** Fetch and parse an RSS/Atom feed URL. */
export async function parseFeed(feedUrl: string): Promise<ParsedFeed> {
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Milkpod/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed (${response.status}): ${feedUrl}`);
  }

  const xml = await response.text();
  return parseXml(xml);
}

// ---------------------------------------------------------------------------
// XML parsing helpers (no external dependency)
// ---------------------------------------------------------------------------

function parseXml(xml: string): ParsedFeed {
  // Detect Atom feeds
  if (xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"')) {
    return parseAtom(xml);
  }
  return parseRss(xml);
}

function parseRss(xml: string): ParsedFeed {
  const channel = extractTag(xml, 'channel') ?? xml;

  const meta: FeedMeta = {
    title: extractTagText(channel, 'title') ?? 'Untitled Feed',
    description: extractTagText(channel, 'description'),
    imageUrl:
      extractTagAttr(channel, 'itunes:image', 'href') ??
      extractTagText(extractTag(channel, 'image') ?? '', 'url'),
    author:
      extractTagText(channel, 'itunes:author') ??
      extractTagText(channel, 'managingEditor'),
    language: extractTagText(channel, 'language'),
  };

  const episodes: FeedEpisode[] = [];
  const items = extractAllTags(channel, 'item');

  for (const item of items) {
    const enclosureUrl = extractTagAttr(item, 'enclosure', 'url');
    const sourceUrl = enclosureUrl ?? extractTagText(item, 'link');
    if (!sourceUrl) continue; // skip items without audio

    const guid =
      extractTagText(item, 'guid') ?? sourceUrl;
    const title = extractTagText(item, 'title') ?? 'Untitled Episode';
    const description =
      extractTagText(item, 'itunes:summary') ??
      extractTagText(item, 'description');
    const publishedAt = extractTagText(item, 'pubDate');
    const duration = parseItunesDuration(
      extractTagText(item, 'itunes:duration')
    );

    episodes.push({ guid, title, description, sourceUrl, publishedAt, duration });
  }

  return { meta, episodes };
}

function parseAtom(xml: string): ParsedFeed {
  const meta: FeedMeta = {
    title: extractTagText(xml, 'title') ?? 'Untitled Feed',
    description: extractTagText(xml, 'subtitle'),
    imageUrl: extractTagAttr(xml, 'logo', 'href') ?? extractTagText(xml, 'logo'),
    author: extractTagText(extractTag(xml, 'author') ?? '', 'name'),
    language: null,
  };

  const episodes: FeedEpisode[] = [];
  const entries = extractAllTags(xml, 'entry');

  for (const entry of entries) {
    const linkUrl =
      extractTagAttr(entry, 'link[rel="enclosure"]', 'href') ??
      extractTagAttr(entry, 'link', 'href');
    if (!linkUrl) continue;

    const guid = extractTagText(entry, 'id') ?? linkUrl;
    const title = extractTagText(entry, 'title') ?? 'Untitled Episode';
    const description =
      extractTagText(entry, 'summary') ??
      extractTagText(entry, 'content');
    const publishedAt =
      extractTagText(entry, 'published') ??
      extractTagText(entry, 'updated');

    episodes.push({
      guid,
      title,
      description,
      sourceUrl: linkUrl,
      publishedAt,
      duration: null,
    });
  }

  return { meta, episodes };
}

// ---------------------------------------------------------------------------
// Tiny XML helpers (regex-based, good enough for RSS/Atom)
// ---------------------------------------------------------------------------

function extractTag(xml: string, tag: string): string | null {
  // Handle tags with attributes
  const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[0] ?? null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi');
  return Array.from(xml.matchAll(regex), (m) => m[0]);
}

function extractTagText(xml: string, tag: string): string | null {
  // Match tag possibly with attributes, capture inner text
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`,
    'i'
  );
  const match = xml.match(regex);
  if (!match) return null;
  const text = (match[1] ?? match[2] ?? '').trim();
  return text.length > 0 ? stripHtml(text) : null;
}

function extractTagAttr(
  xml: string,
  tag: string,
  attr: string
): string | null {
  // Simplified: find the tag and extract the attribute
  const tagName = tag.replace(/\[.*\]/, ''); // strip pseudo-selectors
  const regex = new RegExp(`<${tagName}\\s[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

/** Parse iTunes duration format (HH:MM:SS, MM:SS, or seconds). */
function parseItunesDuration(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Pure integer (seconds)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // HH:MM:SS or MM:SS
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }

  return null;
}
