import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRssArticle } from '../src/services/reader/normalize';

test('normalizeRssArticle flattens object author into readable string', () => {
  const article = normalizeRssArticle(
    {
      id: 'feed-1',
      name: 'Google AI Blog',
      url: 'https://example.com/rss.xml',
      category: 'AI',
      updateFrequency: 60,
      enabled: true,
      source: 'preset',
      lastFetchedAt: null,
      createdAt: '2026-04-01T00:00:00.000Z',
    },
    {
      title: 'Transform your headphones into a live personal translator on iOS.',
      link: 'https://example.com/post',
      author: {
        name: ['Sasha Kapur'],
        title: ['Product Manager'],
      } as unknown as string,
      description: 'English content',
      guid: 'guid-1',
      isoDate: '2026-04-01T10:00:00.000Z',
    }
  );

  assert.equal(article.author, 'Sasha Kapur / Product Manager');
});
