import type { ReaderArticle, ReaderCategory, ReaderDailyBrief, ReaderDailyBriefSection } from './types';
import { READER_CATEGORIES } from './types';

function toSection(category: ReaderCategory, articles: ReaderArticle[]): ReaderDailyBriefSection {
  const sorted = [...articles].sort((left, right) => {
    if (right.importance !== left.importance) {
      return right.importance - left.importance;
    }
    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });

  return {
    category,
    total: sorted.length,
    unread: sorted.filter((article) => !article.isRead).length,
    estimatedReadMinutes: sorted.reduce((sum, article) => sum + article.readTime, 0),
    highlights: sorted.slice(0, 5),
    latest: [...sorted].sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()).slice(0, 8),
  };
}

export function buildDailyBrief(date: string, articles: ReaderArticle[]): ReaderDailyBrief {
  const dayArticles = articles.filter((article) => article.publishedAt.slice(0, 10) === date);
  const sections = READER_CATEGORIES.map((category) => toSection(category, dayArticles.filter((article) => article.category === category)));
  const visibleSections = sections.filter((section) => section.total > 0);

  return {
    date,
    generatedAt: new Date().toISOString(),
    total: dayArticles.length,
    readTime: dayArticles.reduce((sum, article) => sum + article.readTime, 0),
    importantCount: dayArticles.filter((article) => article.importance >= 4).length,
    sections: visibleSections,
  };
}
