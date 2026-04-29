import Parser from 'rss-parser';

import { logger } from '../../utils/logger';
import { requestOpenClawChatCompletion } from '../../utils/openclawModelClient';
import type {
  ReaderArticle,
  ReaderDailyBrief,
  ReaderFeed,
  ReaderOverview,
  ReaderSyncResult,
} from './types';
import { buildDailyBrief } from './brief';
import { normalizeRssArticle } from './normalize';
import {
  clearReaderRuntimeData,
  deleteReadLater,
  ensureReaderStructure,
  readAllArticles,
  readFeeds,
  readReadLater,
  readSyncStatus,
  saveArticle,
  saveDailyBrief,
  saveFeeds,
  saveReadLater,
  saveSyncStatus,
} from './store';

const parser = new Parser({
  customFields: {
    item: ['media:content', 'content:encoded', 'enclosure'],
  },
});

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeArticleRecord(article: ReaderArticle): ReaderArticle {
  return {
    ...article,
    author: typeof article.author === 'string' ? article.author : '未知来源',
    translatedText: typeof article.translatedText === 'string' ? article.translatedText : null,
    translatedAt: typeof article.translatedAt === 'string' ? article.translatedAt : null,
    aiSummary: Array.isArray(article.aiSummary) ? article.aiSummary : null,
    aiSummarizedAt: typeof article.aiSummarizedAt === 'string' ? article.aiSummarizedAt : null,
  };
}

function defaultSummary(article: ReaderArticle) {
  return article.aiSummary && article.aiSummary.length > 0 ? article.aiSummary : article.summary;
}

async function summarizeArticleWithAi(article: ReaderArticle) {
  const sourceText = article.contentText || article.summary.join('\n');
  if (!sourceText.trim()) {
    return null;
  }

  const response = await requestOpenClawChatCompletion([
    {
      role: 'system',
      content: '你是资讯编辑助手。请把输入资讯提炼成 3 条简洁的中文摘要，每条一句。只返回 JSON，格式必须是 {"summary":["...","...","..."]}。不要输出 markdown，不要解释。',
    },
    {
      role: 'user',
      content: `标题：${article.title}\n分类：${article.category}\n正文：\n${sourceText}`,
    },
  ], { maxTokens: 1200, temperature: 0.2 });

  try {
    const json = JSON.parse(response) as { summary?: unknown };
    const summary = Array.isArray(json.summary) ? json.summary.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3) : [];
    return summary.length > 0 ? summary : null;
  } catch {
    return response
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }
}

function mergeArticles(existing: ReaderArticle[], incoming: ReaderArticle[]): ReaderArticle[] {
  const map = new Map(existing.filter((article) => article.sourceType === 'rss').map((article) => [article.dedupeKey, article]));
  for (const article of incoming) {
    const current = map.get(article.dedupeKey);
    if (current) {
      map.set(article.dedupeKey, {
        ...article,
        isRead: current.isRead,
        savedAt: current.savedAt,
        translatedText: current.translatedText ?? article.translatedText ?? null,
        translatedAt: current.translatedAt ?? article.translatedAt ?? null,
        aiSummary: current.aiSummary ?? article.aiSummary ?? null,
        aiSummarizedAt: current.aiSummarizedAt ?? article.aiSummarizedAt ?? null,
      });
      continue;
    }
    map.set(article.dedupeKey, article);
  }
  return [...map.values()].sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

async function persistArticles(readerDir: string, articles: ReaderArticle[]) {
  await Promise.all(articles.map((article) => saveArticle(readerDir, article)));
}

async function markReaderSyncStarted(readerDir: string) {
  const status = await readSyncStatus(readerDir);
  const nextStatus = {
    ...status,
    lastRunAt: new Date().toISOString(),
  };
  await saveSyncStatus(readerDir, nextStatus);
  return nextStatus;
}

async function markReaderSyncFailed(readerDir: string, status: Awaited<ReturnType<typeof markReaderSyncStarted>>, error: unknown) {
  const message = error instanceof Error ? error.message : 'Reader sync failed';
  await saveSyncStatus(readerDir, {
    ...status,
    lastError: message,
  });
}

async function finalizeReaderSync(
  readerDir: string,
  status: Awaited<ReturnType<typeof markReaderSyncStarted>>,
  currentArticles: ReaderArticle[],
  mergedArticles: ReaderArticle[],
  logLabel: string,
): Promise<ReaderSyncResult> {
  await persistArticles(readerDir, mergedArticles);

  const generatedBrief = buildDailyBrief(todayDate(), mergedArticles);
  await saveDailyBrief(readerDir, generatedBrief);

  const importedArticleCount = Math.max(0, mergedArticles.length - currentArticles.length);
  await saveSyncStatus(readerDir, {
    lastRunAt: status.lastRunAt,
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    importedArticleCount,
  });

  logger.info(`Reader ${logLabel} completed: +${importedArticleCount}`, { module: 'Reader' });

  return {
    importedArticleCount,
    generatedBrief,
  };
}

async function syncFeeds(readerDir: string, feeds: ReaderFeed[], currentArticles: ReaderArticle[]) {
  const imported: ReaderArticle[] = [];
  const nextFeeds = [...feeds];

  for (const feed of nextFeeds) {
    if (!feed.enabled) {
      continue;
    }

    try {
      const parsed = await parser.parseURL(feed.url);
      const articles = parsed.items.map((item) => normalizeRssArticle(feed, item as never));
      imported.push(...articles);
      feed.lastFetchedAt = new Date().toISOString();
    } catch (error) {
      logger.error(`Reader feed sync failed: ${(error as Error).message} (${feed.url})`, { module: 'Reader' });
    }
  }

  await saveFeeds(readerDir, nextFeeds);
  return mergeArticles(currentArticles, imported);
}

export async function getReaderOverview(readerDir: string): Promise<ReaderOverview> {
  await ensureReaderStructure(readerDir);
  const [feeds, articles, savedArticles, status] = await Promise.all([
    readFeeds(readerDir),
    readAllArticles(readerDir),
    readReadLater(readerDir),
    readSyncStatus(readerDir),
  ]);
  const normalizedArticles = articles.map(normalizeArticleRecord).filter((article) => article.sourceType === 'rss');
  const savedRssArticles = savedArticles.map(normalizeArticleRecord).filter((article) => article.sourceType === 'rss');
  const brief = buildDailyBrief(todayDate(), normalizedArticles);
  const todayArticles = normalizedArticles.filter((article) => article.publishedAt.startsWith(todayDate()));

  return {
    stats: {
      totalFeeds: feeds.length,
      enabledFeeds: feeds.filter((feed) => feed.enabled).length,
      totalArticles: normalizedArticles.length,
      unreadArticles: normalizedArticles.filter((article) => !article.isRead).length,
      savedArticles: savedRssArticles.length,
      importantArticles: todayArticles.filter((article) => article.importance >= 4).length,
      todayArticles: todayArticles.length,
    },
    brief,
    categories: brief.sections,
    savedArticles: savedRssArticles,
    latestArticles: normalizedArticles.slice(0, 20),
    syncStatus: status,
    readerDir,
  };
}

export async function getReaderFeeds(readerDir: string) {
  return readFeeds(readerDir);
}

export async function createReaderFeed(readerDir: string, input: Pick<ReaderFeed, 'name' | 'url' | 'category'>): Promise<ReaderFeed> {
  const feeds = await readFeeds(readerDir);
  const feed: ReaderFeed = {
    id: `custom-${Date.now()}`,
    name: input.name.trim() || '未命名订阅源',
    url: input.url.trim(),
    category: input.category,
    updateFrequency: 60,
    enabled: true,
    source: 'custom',
    lastFetchedAt: null,
    createdAt: new Date().toISOString(),
  };

  await saveFeeds(readerDir, [...feeds, feed]);
  return feed;
}

export async function deleteReaderFeed(readerDir: string, feedId: string) {
  const feeds = await readFeeds(readerDir);
  await saveFeeds(readerDir, feeds.filter((feed) => feed.id !== feedId));
}

export async function syncReaderNow(readerDir: string): Promise<ReaderSyncResult> {
  await ensureReaderStructure(readerDir);
  const status = await markReaderSyncStarted(readerDir);

  try {
    const [feeds, currentArticles] = await Promise.all([readFeeds(readerDir), readAllArticles(readerDir)]);
    const currentRssArticles = currentArticles.filter((article) => article.sourceType === 'rss');
    const mergedArticles = await syncFeeds(readerDir, feeds, currentRssArticles);
    return finalizeReaderSync(readerDir, status, currentRssArticles, mergedArticles, 'RSS sync');
  } catch (error) {
    await markReaderSyncFailed(readerDir, status, error);
    throw error;
  }
}

export async function pullReaderSubscriptions(readerDir: string): Promise<ReaderSyncResult> {
  await ensureReaderStructure(readerDir);
  const status = await markReaderSyncStarted(readerDir);

  try {
    const [feeds, currentArticles] = await Promise.all([readFeeds(readerDir), readAllArticles(readerDir)]);
    const currentRssArticles = currentArticles.filter((article) => article.sourceType === 'rss');
    const mergedArticles = await syncFeeds(readerDir, feeds, currentRssArticles);
    return finalizeReaderSync(readerDir, status, currentRssArticles, mergedArticles, 'RSS subscription pull');
  } catch (error) {
    await markReaderSyncFailed(readerDir, status, error);
    throw error;
  }
}

export async function rebuildReaderBrief(readerDir: string): Promise<ReaderDailyBrief> {
  await ensureReaderStructure(readerDir);
  const articles = (await readAllArticles(readerDir)).filter((article) => article.sourceType === 'rss');
  const generatedBrief = buildDailyBrief(todayDate(), articles);
  await saveDailyBrief(readerDir, generatedBrief);
  logger.info(`Reader brief rebuilt: ${generatedBrief.total} articles`, { module: 'Reader' });
  return generatedBrief;
}

export async function getReaderArticles(readerDir: string, options: {
  category?: string;
  date?: string;
  sourceType?: 'rss';
  savedOnly?: boolean;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const [articles, savedArticles] = await Promise.all([readAllArticles(readerDir), readReadLater(readerDir)]);
  const savedIds = new Set(savedArticles.map((article) => article.id));

  return articles
    .map(normalizeArticleRecord)
    .filter((article) => article.sourceType === 'rss')
    .map((article) => ({ ...article, savedAt: savedIds.has(article.id) ? article.savedAt || new Date().toISOString() : article.savedAt }))
    .filter((article) => (options.category ? article.category === options.category : true))
    .filter((article) => (options.date ? article.publishedAt.slice(0, 10) === options.date : true))
    .filter((article) => (options.sourceType ? article.sourceType === options.sourceType : true))
    .filter((article) => (options.savedOnly ? savedIds.has(article.id) : true))
    .filter((article) => (options.unreadOnly ? !article.isRead : true))
    .slice(options.offset || 0, (options.offset || 0) + (options.limit || 100));
}

export async function getReaderArticle(readerDir: string, articleId: string) {
  const articles = await readAllArticles(readerDir);
  const article = articles.find((article) => article.id === articleId) || null;
  return article ? normalizeArticleRecord(article) : null;
}

export async function markReaderArticle(readerDir: string, articleId: string, isRead: boolean) {
  const articles = await readAllArticles(readerDir);
  const target = articles.find((article) => article.id === articleId);
  if (!target) {
    return null;
  }

  const updated = { ...target, isRead };
  await saveArticle(readerDir, updated);
  return normalizeArticleRecord(updated);
}

export async function saveReaderArticleForLater(readerDir: string, articleId: string) {
  const article = await getReaderArticle(readerDir, articleId);
  if (!article) {
    return null;
  }

  const updated = { ...article, savedAt: new Date().toISOString() };
  await saveArticle(readerDir, updated);
  await saveReadLater(readerDir, updated);
  return normalizeArticleRecord(updated);
}

export async function removeReaderArticleFromLater(readerDir: string, articleId: string) {
  const article = await getReaderArticle(readerDir, articleId);
  if (!article) {
    return null;
  }

  const updated = { ...article, savedAt: null };
  await saveArticle(readerDir, updated);
  await deleteReadLater(readerDir, articleId);
  return normalizeArticleRecord(updated);
}

export async function getReaderDailyBrief(readerDir: string, date: string): Promise<ReaderDailyBrief> {
  const articles = (await readAllArticles(readerDir)).filter((article) => article.sourceType === 'rss');
  const generated = buildDailyBrief(date, articles);
  await saveDailyBrief(readerDir, generated);
  return generated;
}

export async function translateReaderArticle(readerDir: string, articleId: string) {
  const article = await getReaderArticle(readerDir, articleId);
  if (!article) {
    return null;
  }

  const sourceText = article.contentText || article.summary.join('\n');
  if (!sourceText.trim()) {
    throw new Error('当前资讯没有可翻译的正文内容');
  }

  const translatedText = await requestOpenClawChatCompletion([
    {
      role: 'system',
      content: '你是专业翻译助手。请把用户提供的英文资讯完整翻译成简体中文，保留原始结构和段落，不要额外总结，不要解释，不要省略内容。',
    },
    {
      role: 'user',
      content: `请把以下资讯全文翻译成简体中文。\n\n标题：${article.title}\n\n正文：\n${sourceText}`,
    },
  ], { maxTokens: 6000, temperature: 0.1 });

  const updated = {
    ...article,
    translatedText,
    translatedAt: new Date().toISOString(),
  };
  await saveArticle(readerDir, updated);
  return normalizeArticleRecord(updated);
}

export async function summarizeReaderArticle(readerDir: string, articleId: string) {
  const article = await getReaderArticle(readerDir, articleId);
  if (!article) {
    return null;
  }

  const aiSummary = await summarizeArticleWithAi(article);
  if (!aiSummary || aiSummary.length === 0) {
    throw new Error('AI 未返回可用摘要');
  }

  const updated = {
    ...article,
    aiSummary,
    aiSummarizedAt: new Date().toISOString(),
  };
  await saveArticle(readerDir, updated);
  return normalizeArticleRecord(updated);
}

export async function clearReaderData(readerDir: string) {
  await clearReaderRuntimeData(readerDir);
}
