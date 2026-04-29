import crypto from 'crypto';

import type { ReaderArticle, ReaderCategory, ReaderFeed } from './types';

function normalizeAuthor(author: unknown, fallback: string): string {
  if (typeof author === 'string') {
    return author.trim() || fallback;
  }

  if (Array.isArray(author)) {
    const text: string = author.map((item) => normalizeAuthor(item, '')).filter(Boolean).join(' / ');
    return text || fallback;
  }

  if (author && typeof author === 'object') {
    const record = author as Record<string, unknown>;
    const flattened: string = Object.values(record)
      .map((item) => normalizeAuthor(item, ''))
      .filter(Boolean)
      .join(' / ');
    return flattened || fallback;
  }

  return fallback;
}

function normalizeText(content: string | undefined) {
  return (content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCategory(title: string, content: string, fallback: ReaderCategory = '未分类'): ReaderCategory {
  const text = `${title} ${content}`.toLowerCase();
  if (/(openai|anthropic|gemini|gpt|claude|llm|模型|ai|大模型|智能体)/.test(text)) return 'AI';
  if (/(iphone|android|芯片|tech|科技|软件|硬件|tesla|苹果|谷歌|微软)/.test(text)) return '科技';
  if (/(股市|融资|ipo|财报|reuters|bloomberg|投资|美股|港股|财经)/.test(text)) return '财经';
  if (/(新闻|国际|社会|bbc|央视|早报|澎湃|新华社)/.test(text)) return '新闻';
  if (/(game|游戏|nintendo|switch|ps5|xbox|steam|indie|机核)/.test(text)) return '游戏';
  return fallback;
}

function inferImportance(title: string, content: string): 1 | 2 | 3 | 4 | 5 {
  const text = `${title} ${content}`.toLowerCase();
  if (/(发布|融资|上线|重磅|breaking|重大|推出|开源)/.test(text)) return 5;
  if (/(更新|计划|传闻|测试|预告)/.test(text)) return 4;
  return 3;
}

function buildSummary(title: string, contentText: string): string[] {
  const parts = contentText.split(/[。！？!?.]/).map((part) => part.trim()).filter(Boolean);
  const summary = parts.slice(0, 3);
  if (summary.length > 0) {
    return summary;
  }
  return [title, contentText.slice(0, 60) || '暂无摘要'];
}

function buildKeywords(title: string, contentText: string, category: ReaderCategory): string[] {
  const keywordPool = new Set<string>();
  const source = `${title} ${contentText}`;
  const matches = source.match(/[A-Za-z0-9\-+#]{3,}|[\u4e00-\u9fa5]{2,6}/g) || [];
  for (const item of matches) {
    const normalized = item.trim();
    if (normalized.length < 2) {
      continue;
    }
    keywordPool.add(normalized);
    if (keywordPool.size >= 4) {
      break;
    }
  }

  if (keywordPool.size === 0) {
    keywordPool.add(category);
  }

  return [...keywordPool].slice(0, 5);
}

function createArticleId(seed: string) {
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function createDedupeKey(title: string, url: string) {
  return crypto.createHash('sha1').update(`${title}|${url}`).digest('hex');
}

export function normalizeRssArticle(feed: ReaderFeed, item: {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  description?: string;
  ['content:encoded']?: string;
  enclosure?: { url?: string };
  guid?: string;
}): ReaderArticle {
  const title = (item.title || '无标题资讯').trim();
  const url = item.link || '';
  const contentHtml = item['content:encoded'] || item.content || item.description || '';
  const contentText = normalizeText(contentHtml);
  const category = inferCategory(title, contentText, feed.category);
  const dedupeKey = createDedupeKey(title, url || title);
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

  return {
    id: createArticleId(item.guid || `${feed.id}|${dedupeKey}`),
    feedId: feed.id,
    sourceType: 'rss',
    title,
    url,
    author: normalizeAuthor(item.creator || item.author, feed.name),
    publishedAt,
    fetchedAt: new Date().toISOString(),
    category,
    importance: inferImportance(title, contentText),
    summary: buildSummary(title, contentText),
    keywords: buildKeywords(title, contentText, category),
    contentText,
    contentHtml,
    imageUrl: item.enclosure?.url || '',
    readTime: Math.max(1, Math.ceil(contentText.length / 280)),
    isRead: false,
    savedAt: null,
    dedupeKey,
    originPath: null,
    translatedText: null,
    translatedAt: null,
    aiSummary: null,
    aiSummarizedAt: null,
  };
}
