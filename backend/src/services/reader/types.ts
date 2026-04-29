export const READER_CATEGORIES = ['AI', '科技', '财经', '新闻', '游戏', '未分类'] as const;

export type ReaderCategory = typeof READER_CATEGORIES[number];

export type ReaderSourceType = 'rss';

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

export interface ReaderOverview {
  stats: ReaderStats;
  brief: ReaderDailyBrief;
  categories: ReaderDailyBriefSection[];
  savedArticles: ReaderArticle[];
  latestArticles: ReaderArticle[];
  syncStatus: ReaderSyncStatus;
  readerDir: string;
}

export interface ReaderSyncStatus {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  importedArticleCount: number;
}

export interface ReaderSyncResult {
  importedArticleCount: number;
  generatedBrief: ReaderDailyBrief;
}
