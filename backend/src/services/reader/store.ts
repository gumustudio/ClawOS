import fs from 'fs/promises';
import path from 'path';

import type {
  ReaderArticle,
  ReaderDailyBrief,
  ReaderFeed,
  ReaderInboxBucketStatus,
  ReaderInboxPayload,
  ReaderSyncStatus,
} from './types';
import { READER_PRESET_FEEDS } from './presets';

const DEFAULT_STATUS: ReaderSyncStatus = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  processedInboxCount: 0,
  importedArticleCount: 0,
};

function getConfigPath(readerDir: string) {
  return path.join(readerDir, 'config', 'feeds.json');
}

function getStatusPath(readerDir: string) {
  return path.join(readerDir, 'config', 'status.json');
}

function getBriefPath(readerDir: string, date: string) {
  return path.join(readerDir, 'briefs', `${date}.json`);
}

function getArticlePath(readerDir: string, date: string, articleId: string) {
  return path.join(readerDir, 'feeds', date, `${articleId}.json`);
}

function getReadLaterPath(readerDir: string, articleId: string) {
  return path.join(readerDir, 'read-later', `${articleId}.json`);
}

async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mergePresetFeeds(currentFeeds: ReaderFeed[]) {
  const currentById = new Map(currentFeeds.map((feed) => [feed.id, feed]));
  const merged = [...currentFeeds];

  for (const presetFeed of READER_PRESET_FEEDS) {
    if (!currentById.has(presetFeed.id)) {
      merged.push(presetFeed);
    }
  }

  return merged;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function ensureReaderStructure(readerDir: string) {
  await Promise.all([
    fs.mkdir(path.join(readerDir, 'inbox', 'pending'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'inbox', 'processed'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'inbox', 'failed'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'feeds'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'briefs'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'config'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'read-later'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'cache'), { recursive: true }),
    fs.mkdir(path.join(readerDir, 'assets'), { recursive: true }),
  ]);

  const currentFeeds = await readJsonFile<ReaderFeed[] | null>(getConfigPath(readerDir), null);
  if (!currentFeeds || currentFeeds.length === 0) {
    await writeJsonFile(getConfigPath(readerDir), READER_PRESET_FEEDS);
  }
}

export async function readFeeds(readerDir: string): Promise<ReaderFeed[]> {
  await ensureReaderStructure(readerDir);
  const feeds = await readJsonFile<ReaderFeed[]>(getConfigPath(readerDir), READER_PRESET_FEEDS);
  const merged = mergePresetFeeds(feeds);
  if (merged.length !== feeds.length) {
    await saveFeeds(readerDir, merged);
  }
  return merged;
}

export async function saveFeeds(readerDir: string, feeds: ReaderFeed[]) {
  await writeJsonFile(getConfigPath(readerDir), feeds);
}

export async function readSyncStatus(readerDir: string): Promise<ReaderSyncStatus> {
  await ensureReaderStructure(readerDir);
  return readJsonFile<ReaderSyncStatus>(getStatusPath(readerDir), DEFAULT_STATUS);
}

export async function saveSyncStatus(readerDir: string, status: ReaderSyncStatus) {
  await writeJsonFile(getStatusPath(readerDir), status);
}

export async function saveArticle(readerDir: string, article: ReaderArticle) {
  const dateKey = article.publishedAt.slice(0, 10);
  await writeJsonFile(getArticlePath(readerDir, dateKey, article.id), article);
}

export async function readAllArticles(readerDir: string): Promise<ReaderArticle[]> {
  await ensureReaderStructure(readerDir);
  const feedsRoot = path.join(readerDir, 'feeds');
  const dateEntries = await fs.readdir(feedsRoot, { withFileTypes: true }).catch(() => []);
  const articles: ReaderArticle[] = [];

  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory()) {
      continue;
    }

    const dateDir = path.join(feedsRoot, dateEntry.name);
    const fileEntries = await fs.readdir(dateDir, { withFileTypes: true }).catch(() => []);
    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('.json')) {
        continue;
      }

      const article = await readJsonFile<ReaderArticle | null>(path.join(dateDir, fileEntry.name), null);
      if (article) {
        articles.push(article);
      }
    }
  }

  return articles.sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

export async function saveDailyBrief(readerDir: string, brief: ReaderDailyBrief) {
  await writeJsonFile(getBriefPath(readerDir, brief.date), brief);
}

export async function readDailyBrief(readerDir: string, date: string): Promise<ReaderDailyBrief | null> {
  await ensureReaderStructure(readerDir);
  return readJsonFile<ReaderDailyBrief | null>(getBriefPath(readerDir, date), null);
}

export async function saveReadLater(readerDir: string, article: ReaderArticle) {
  await writeJsonFile(getReadLaterPath(readerDir, article.id), article);
}

export async function deleteReadLater(readerDir: string, articleId: string) {
  await fs.rm(getReadLaterPath(readerDir, articleId), { force: true });
}

export async function readReadLater(readerDir: string): Promise<ReaderArticle[]> {
  await ensureReaderStructure(readerDir);
  const dir = path.join(readerDir, 'read-later');
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const items: ReaderArticle[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const item = await readJsonFile<ReaderArticle | null>(path.join(dir, entry.name), null);
    if (item) {
      items.push(item);
    }
  }

  return items.sort((left, right) => new Date(right.savedAt || right.publishedAt).getTime() - new Date(left.savedAt || left.publishedAt).getTime());
}

export async function readPendingInboxFiles(readerDir: string): Promise<string[]> {
  await ensureReaderStructure(readerDir);
  const pendingDir = path.join(readerDir, 'inbox', 'pending');
  const entries = await fs.readdir(pendingDir, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(pendingDir, entry.name))
    .sort();
}

export async function readInboxBucketStatus(
  readerDir: string,
  bucket: 'pending' | 'processed' | 'failed',
  limit = 5,
): Promise<ReaderInboxBucketStatus> {
  await ensureReaderStructure(readerDir);
  const bucketDir = path.join(readerDir, 'inbox', bucket);
  const entries = await fs.readdir(bucketDir, { withFileTypes: true }).catch(() => []);
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  return {
    count: fileNames.length,
    files: fileNames.slice(0, limit),
  };
}

export async function readInboxPayload(filePath: string): Promise<ReaderInboxPayload> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as ReaderInboxPayload;
}

export async function moveInboxFile(readerDir: string, filePath: string, bucket: 'processed' | 'failed') {
  const targetPath = path.join(readerDir, 'inbox', bucket, path.basename(filePath));
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rename(filePath, targetPath);
}

export async function clearReaderRuntimeData(readerDir: string) {
  await Promise.all([
    fs.rm(path.join(readerDir, 'feeds'), { recursive: true, force: true }),
    fs.rm(path.join(readerDir, 'briefs'), { recursive: true, force: true }),
    fs.rm(path.join(readerDir, 'read-later'), { recursive: true, force: true }),
    fs.rm(path.join(readerDir, 'cache'), { recursive: true, force: true }),
    fs.rm(path.join(readerDir, 'inbox', 'processed'), { recursive: true, force: true }),
    fs.rm(path.join(readerDir, 'inbox', 'failed'), { recursive: true, force: true }),
  ]);

  await ensureReaderStructure(readerDir);
  await saveSyncStatus(readerDir, DEFAULT_STATUS);
}
