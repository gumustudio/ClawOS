import { Router } from 'express';

import { logger } from '../utils/logger';
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../utils/serverConfig';
import {
  createReaderFeed,
  deleteReaderFeed,
  getReaderArticle,
  getReaderArticles,
  getReaderDailyBrief,
  getReaderFeeds,
  getReaderOverview,
  markReaderArticle,
  pullReaderSubscriptions,
  rebuildReaderBrief,
  refreshReaderLocalInbox,
  removeReaderArticleFromLater,
  saveReaderArticleForLater,
  summarizeReaderArticle,
  syncReaderNow,
  translateReaderArticle,
  clearReaderData,
} from '../services/reader/service';
import type { ReaderCategory } from '../services/reader/types';

const router = Router();

async function getReaderDir() {
  const paths = await getServerPaths();
  return paths.readerDir || DEFAULT_SERVER_PATHS.readerDir;
}

router.get('/overview', async (_req, res) => {
  try {
    const data = await getReaderOverview(await getReaderDir());
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Reader overview failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/feeds', async (_req, res) => {
  try {
    const data = await getReaderFeeds(await getReaderDir());
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Reader feeds failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/feeds', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url) {
      return res.status(400).json({ success: false, error: 'RSS URL 不能为空' });
    }

    const category = (req.body?.category || '未分类') as ReaderCategory;
    const feed = await createReaderFeed(await getReaderDir(), {
      name: String(req.body?.name || '').trim() || '自定义订阅源',
      url,
      category,
    });
    res.json({ success: true, data: feed });
  } catch (error) {
    logger.error(`Reader create feed failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/feeds/:id', async (req, res) => {
  try {
    await deleteReaderFeed(await getReaderDir(), req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Reader delete feed failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/sync', async (_req, res) => {
  try {
    const result = await syncReaderNow(await getReaderDir());
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Reader sync failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/pull', async (_req, res) => {
  try {
    const result = await pullReaderSubscriptions(await getReaderDir());
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Reader pull failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    const result = await refreshReaderLocalInbox(await getReaderDir());
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Reader refresh failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/brief/rebuild', async (_req, res) => {
  try {
    const result = await rebuildReaderBrief(await getReaderDir());
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Reader brief rebuild failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/articles', async (req, res) => {
  try {
    const data = await getReaderArticles(await getReaderDir(), {
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
      sourceType: req.query.source === 'rss' || req.query.source === 'openclaw' ? req.query.source : undefined,
      savedOnly: req.query.saved === '1',
      unreadOnly: req.query.unread === '1',
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Reader articles failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/articles/:id/summarize', async (req, res) => {
  try {
    const article = await summarizeReaderArticle(await getReaderDir(), req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: '资讯不存在' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error(`Reader summarize failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/runtime-data', async (_req, res) => {
  try {
    await clearReaderData(await getReaderDir());
    res.json({ success: true });
  } catch (error) {
    logger.error(`Reader clear runtime data failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/articles/:id', async (req, res) => {
  try {
    const article = await getReaderArticle(await getReaderDir(), req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: '资讯不存在' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error(`Reader article detail failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/articles/:id/read', async (req, res) => {
  try {
    const article = await markReaderArticle(await getReaderDir(), req.params.id, req.body?.isRead !== false);
    if (!article) {
      return res.status(404).json({ success: false, error: '资讯不存在' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error(`Reader mark read failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/articles/:id/save', async (req, res) => {
  try {
    const article = req.body?.saved === false
      ? await removeReaderArticleFromLater(await getReaderDir(), req.params.id)
      : await saveReaderArticleForLater(await getReaderDir(), req.params.id);

    if (!article) {
      return res.status(404).json({ success: false, error: '资讯不存在' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error(`Reader save article failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/articles/:id/translate', async (req, res) => {
  try {
    const article = await translateReaderArticle(await getReaderDir(), req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: '资讯不存在' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    logger.error(`Reader translate failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/daily-brief', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const data = await getReaderDailyBrief(await getReaderDir(), date);
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Reader daily brief failed: ${(error as Error).message}`, { module: 'Reader' });
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
