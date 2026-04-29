import cron from 'node-cron';

import { logger } from '../../utils/logger';
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../../utils/serverConfig';
import { pullReaderSubscriptions, rebuildReaderBrief } from './service';

let initialized = false;

async function getReaderDir() {
  const paths = await getServerPaths();
  return paths.readerDir || DEFAULT_SERVER_PATHS.readerDir;
}

async function runScheduledFetch() {
  try {
    const readerDir = await getReaderDir();
    const pullResult = await pullReaderSubscriptions(readerDir);
    logger.info(`Reader RSS fetch job completed: +${pullResult.importedArticleCount}`, { module: 'Reader' });
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
}
