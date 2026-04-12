import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

function createFeedXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>ClawOS Feed</title>
        <item>
          <guid>${title}-guid</guid>
          <title>${title}</title>
          <link>https://example.com/${encodeURIComponent(title)}</link>
          <pubDate>Wed, 01 Apr 2026 07:30:00 GMT</pubDate>
          <description>${title} description with AI and product updates.</description>
        </item>
      </channel>
    </rss>`;
}

async function startFeedServer(feedXml: string) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    res.end(feedXml);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve reader test server address');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/feed.xml`
  };
}

test('reader routes expose overview, pull rss feeds and refresh openclaw inbox separately', async () => {
  const originalHome = process.env.HOME;
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-reader-test-'));
  const feedServer = await startFeedServer(createFeedXml('First Article'));
  const readerDir = path.join(tempHome, 'RSS资讯');

  process.env.HOME = tempHome;

  try {
    await fs.mkdir(path.join(tempHome, '.clawos'), { recursive: true });
    await fs.writeFile(
      path.join(tempHome, '.clawos', 'config.json'),
      JSON.stringify({ paths: { readerDir } }, null, 2),
      'utf8'
    );

    const { default: readerRoutes } = await import(`../src/routes/reader?ts=${Date.now()}`);
    const app = express();
    app.use(express.json());
    app.use('/api/system/reader', readerRoutes);

    const initialOverview = await request(app).get('/api/system/reader/overview');
    assert.equal(initialOverview.status, 200);
    assert.equal(initialOverview.body.success, true);
    assert.equal(initialOverview.body.data.readerDir, readerDir);
    assert.equal(initialOverview.body.data.stats.totalFeeds >= 1, true);
    assert.equal(initialOverview.body.data.inboxStatus.pending.count, 0);

    const createFeedResponse = await request(app)
      .post('/api/system/reader/feeds')
      .send({ name: 'Demo Feed', url: feedServer.url, category: 'AI' });

    assert.equal(createFeedResponse.status, 200);
    assert.equal(createFeedResponse.body.success, true);

    await fs.writeFile(
      path.join(readerDir, 'config', 'feeds.json'),
      JSON.stringify([createFeedResponse.body.data], null, 2),
      'utf8'
    );

    await fs.mkdir(path.join(readerDir, 'inbox', 'pending'), { recursive: true });
    await fs.writeFile(
      path.join(readerDir, 'inbox', 'pending', 'openclaw-brief.json'),
      JSON.stringify({
        version: '1.0',
        source: 'openclaw',
        generatedAt: '2026-04-01T07:55:00.000Z',
        taskName: 'morning-brief',
        items: [
          {
            title: 'OpenClaw collected AI market update',
            url: 'https://example.com/openclaw-ai-market',
            content: 'OpenClaw summary content for the morning AI market update.',
            category: 'AI',
            importance: 5,
            summary: ['第一句', '第二句', '第三句'],
            keywords: ['OpenClaw', 'AI', '市场'],
            publishedAt: '2026-04-01T07:40:00.000Z'
          }
        ]
      }, null, 2),
      'utf8'
    );

    const overviewWithPending = await request(app).get('/api/system/reader/overview');
    assert.equal(overviewWithPending.status, 200);
    assert.equal(overviewWithPending.body.success, true);
    assert.equal(overviewWithPending.body.data.inboxStatus.pending.count, 1);

    const pullResponse = await request(app).post('/api/system/reader/pull');
    assert.equal(pullResponse.status, 200);
    assert.equal(pullResponse.body.success, true);
    assert.equal(pullResponse.body.data.processedInboxCount, 0);
    assert.equal(pullResponse.body.data.importedArticleCount >= 1, true);

    const refreshResponse = await request(app).post('/api/system/reader/refresh');
    assert.equal(refreshResponse.status, 200);
    assert.equal(refreshResponse.body.success, true);
    assert.equal(refreshResponse.body.data.processedInboxCount, 1);
    assert.equal(refreshResponse.body.data.generatedBrief.total >= 1, true);

    const refreshedOverview = await request(app).get('/api/system/reader/overview');
    assert.equal(refreshedOverview.status, 200);
    assert.equal(refreshedOverview.body.success, true);
    assert.equal(refreshedOverview.body.data.inboxStatus.pending.count, 0);
    assert.equal(refreshedOverview.body.data.inboxStatus.processed.count, 1);

    const processedFile = path.join(readerDir, 'inbox', 'processed', 'openclaw-brief.json');
    const processedFileExists = await fs.access(processedFile).then(() => true).catch(() => false);
    assert.equal(processedFileExists, true);

    const articlesResponse = await request(app).get('/api/system/reader/articles?category=AI');
    assert.equal(articlesResponse.status, 200);
    assert.equal(articlesResponse.body.success, true);
    assert.equal(articlesResponse.body.data.length >= 1, true);

    const openclawArticlesResponse = await request(app).get('/api/system/reader/articles?source=openclaw');
    assert.equal(openclawArticlesResponse.status, 200);
    assert.equal(openclawArticlesResponse.body.success, true);
    assert.equal(openclawArticlesResponse.body.data.length, 1);
    assert.equal(openclawArticlesResponse.body.data[0].sourceType, 'openclaw');

    const rssArticlesResponse = await request(app).get('/api/system/reader/articles?source=rss');
    assert.equal(rssArticlesResponse.status, 200);
    assert.equal(rssArticlesResponse.body.success, true);
    assert.equal(rssArticlesResponse.body.data.every((article: { sourceType: string }) => article.sourceType === 'rss'), true);

    const articleId = articlesResponse.body.data[0].id as string;
    const saveResponse = await request(app).post(`/api/system/reader/articles/${articleId}/save`).send({ saved: true });
    assert.equal(saveResponse.status, 200);
    assert.equal(saveResponse.body.success, true);

    const readResponse = await request(app).post(`/api/system/reader/articles/${articleId}/read`).send({ isRead: true });
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.body.data.isRead, true);

    const briefResponse = await request(app).get('/api/system/reader/daily-brief?date=2026-04-01');
    assert.equal(briefResponse.status, 200);
    assert.equal(briefResponse.body.success, true);
    assert.equal(Array.isArray(briefResponse.body.data.sections), true);
  } finally {
    process.env.HOME = originalHome;
    feedServer.server.close();
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
