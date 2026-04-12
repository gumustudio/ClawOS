export const READER_CATEGORIES = ['AI', '科技', '财经', '新闻', '游戏', '未分类'] as const;

export type ReaderCategory = typeof READER_CATEGORIES[number];

export type ReaderSourceType = 'rss' | 'openclaw';

export interface ReaderFeed {
  id: string;
  name: string;
  url: string;
  category: ReaderCategory;
  updateFrequency: number;
  enabled: boolean;
  source: 'preset' | 'custom';
  lastFetchedAt: string | null;
  createdAt: string;
}

export interface ReaderArticle {
  id: string;
  feedId: string | null;
  sourceType: ReaderSourceType;
  title: string;
  url: string;
  author: string;
  publishedAt: string;
  fetchedAt: string;
  category: ReaderCategory;
  importance: 1 | 2 | 3 | 4 | 5;
  summary: string[];
  keywords: string[];
  contentText: string;
  contentHtml: string;
  imageUrl: string;
  readTime: number;
  isRead: boolean;
  savedAt: string | null;
  dedupeKey: string;
  originPath: string | null;
  translatedText?: string | null;
  translatedAt?: string | null;
  aiSummary?: string[] | null;
  aiSummarizedAt?: string | null;
}

export interface ReaderDailyBriefSection {
  category: ReaderCategory;
  total: number;
  unread: number;
  estimatedReadMinutes: number;
  highlights: ReaderArticle[];
  latest: ReaderArticle[];
}

export interface ReaderDailyBrief {
  date: string;
  generatedAt: string;
  total: number;
  readTime: number;
  importantCount: number;
  sections: ReaderDailyBriefSection[];
}

export interface ReaderStats {
  totalFeeds: number;
  enabledFeeds: number;
  totalArticles: number;
  unreadArticles: number;
  savedArticles: number;
  importantArticles: number;
  todayArticles: number;
}

export interface ReaderInboxBucketStatus {
  count: number;
  files: string[];
}

export interface ReaderInboxStatus {
  pending: ReaderInboxBucketStatus;
  processed: ReaderInboxBucketStatus;
  failed: ReaderInboxBucketStatus;
}

export interface ReaderOverview {
  stats: ReaderStats;
  brief: ReaderDailyBrief;
  categories: ReaderDailyBriefSection[];
  savedArticles: ReaderArticle[];
  latestArticles: ReaderArticle[];
  syncStatus: ReaderSyncStatus;
  inboxStatus: ReaderInboxStatus;
  readerDir: string;
}

export interface ReaderSyncStatus {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  processedInboxCount: number;
  importedArticleCount: number;
}

export interface ReaderInboxPayload {
  version: '1.0';
  source: 'openclaw';
  generatedAt: string;
  taskName?: string;
  items: Array<{
    id?: string;
    title: string;
    url: string;
    content?: string;
    summary?: string[];
    keywords?: string[];
    category?: ReaderCategory;
    importance?: number;
    publishedAt?: string;
    author?: string;
    imageUrl?: string;
  }>;
}

export interface ReaderSyncResult {
  processedInboxCount: number;
  importedArticleCount: number;
  generatedBrief: ReaderDailyBrief;
}
