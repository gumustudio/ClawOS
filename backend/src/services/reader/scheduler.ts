import cron from 'node-cron';

import { logger } from '../../utils/logger';
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../../utils/serverConfig';
import { pullReaderSubscriptions, rebuildReaderBrief, refreshReaderLocalInbox } from './service';

let initialized = false;
let inboxRefreshRunning = false;

async function getReaderDir() {
  const paths = await getServerPaths();
  return paths.readerDir || DEFAULT_SERVER_PATHS.readerDir;
}

async function runAutoInboxRefresh(trigger: 'startup' | 'interval') {
  if (inboxRefreshRunning) {
    return;
  }

  inboxRefreshRunning = true;
  try {
    const readerDir = await getReaderDir();
    const result = await refreshReaderLocalInbox(readerDir);
    if (result.processedInboxCount > 0 || result.importedArticleCount > 0) {
      logger.info(`Reader auto inbox refresh (${trigger}) completed: +${result.importedArticleCount}, inbox ${result.processedInboxCount}`, { module: 'Reader' });
    }
  } catch (error) {
    logger.error(`Reader auto inbox refresh (${trigger}) failed: ${(error as Error).message}`, { module: 'Reader' });
  } finally {
    inboxRefreshRunning = false;
  }
}

async function runScheduledFetch() {
  try {
    const readerDir = await getReaderDir();
    const pullResult = await pullReaderSubscriptions(readerDir);
    const refreshResult = await refreshReaderLocalInbox(readerDir);
    logger.info(`Reader fetch job completed: pull +${pullResult.importedArticleCount}, refresh +${refreshResult.importedArticleCount}, inbox ${refreshResult.processedInboxCount}`, { module: 'Reader' });
  } catch (error) {
    logger.error(`Reader fetch job failed: ${(error as Error).message}`, { module: 'Reader' });
  }
}

async function runScheduledBrief() {
  try {
    const readerDir = await getReaderDir();
    const brief = await rebuildReaderBrief(readerDir);
    logger.info(`Reader brief job completed: ${brief.total} articles`, { module: 'Reader' });
  } catch (error) {
    logger.error(`Reader brief job failed: ${(error as Error).message}`, { module: 'Reader' });
  }
}

export function initReaderScheduler() {
  if (initialized) {
    return;
  }

  initialized = true;
  cron.schedule('55 7 * * *', () => {
    void runScheduledFetch();
  });
  cron.schedule('0 8 * * *', () => {
    void runScheduledBrief();
  });

  setTimeout(() => {
    void runAutoInboxRefresh('startup');
  }, 15_000);

  setInterval(() => {
    void runAutoInboxRefresh('interval');
  }, 60_000);
}
