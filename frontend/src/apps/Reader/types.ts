export type ReaderCategory = 'AI' | '科技' | '财经' | '新闻' | '游戏' | '未分类'

export interface ReaderFeed {
  id: string
  name: string
  url: string
  category: ReaderCategory
  updateFrequency: number
  enabled: boolean
  source: 'preset' | 'custom'
  lastFetchedAt: string | null
  createdAt: string
}

export interface ReaderArticle {
  id: string
  feedId: string | null
  sourceType: 'rss' | 'openclaw'
  title: string
  url: string
  author: string
  publishedAt: string
  fetchedAt: string
  category: ReaderCategory
  importance: 1 | 2 | 3 | 4 | 5
  summary: string[]
  keywords: string[]
  contentText: string
  contentHtml: string
  imageUrl: string
  readTime: number
  isRead: boolean
  savedAt: string | null
  dedupeKey: string
  originPath: string | null
  translatedText?: string | null
  translatedAt?: string | null
  aiSummary?: string[] | null
  aiSummarizedAt?: string | null
}

export interface ReaderDailyBriefSection {
  category: ReaderCategory
  total: number
  unread: number
  estimatedReadMinutes: number
  highlights: ReaderArticle[]
  latest: ReaderArticle[]
}

export interface ReaderDailyBrief {
  date: string
  generatedAt: string
  total: number
  readTime: number
  importantCount: number
  sections: ReaderDailyBriefSection[]
}

export interface ReaderOverview {
  stats: {
    totalFeeds: number
    enabledFeeds: number
    totalArticles: number
    unreadArticles: number
    savedArticles: number
    importantArticles: number
    todayArticles: number
  }
  brief: ReaderDailyBrief
  categories: ReaderDailyBriefSection[]
  savedArticles: ReaderArticle[]
  latestArticles: ReaderArticle[]
  syncStatus: {
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    processedInboxCount: number
    importedArticleCount: number
  }
  inboxStatus: {
    pending: { count: number; files: string[] }
    processed: { count: number; files: string[] }
    failed: { count: number; files: string[] }
  }
  readerDir: string
}

export type ReaderView = 'brief' | 'category' | 'openclaw' | 'feeds' | 'saved'
