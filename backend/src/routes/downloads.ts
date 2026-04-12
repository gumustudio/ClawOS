import { Router } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { getAria2ConfPath, getAria2RpcUrl, getAria2Secret } from '../utils/localServices';
import { DEFAULT_SERVER_PATHS, updateServerPaths } from '../utils/serverConfig';

const router = Router();

type Aria2TaskStatus = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
type DownloadAction = 'pause' | 'resume' | 'remove';
type DownloadCleanupScope = 'completed' | 'failed' | 'all-history';

interface Aria2TaskFile {
  path?: string;
}

interface Aria2Task {
  gid: string;
  status: Aria2TaskStatus;
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  dir: string;
  files?: Aria2TaskFile[];
  bittorrent?: {
    info?: {
      name?: string;
    };
  };
  errorCode?: string;
  errorMessage?: string;
}

interface Aria2JsonRpcResponse<T> {
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildAria2Payload(method: string, params: unknown[] = []) {
  return {
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method,
    params: [`token:${getAria2Secret()}`, ...params]
  };
}

async function callAria2<T>(method: string, params: unknown[] = []) {
  const response = await fetch(getAria2RpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAria2Payload(method, params))
  });

  const data = await response.json() as Aria2JsonRpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message || `aria2 ${method} failed`);
  }

  return data.result as T;
}

async function readDownloadDir() {
  try {
    const confData = await fs.readFile(getAria2ConfPath(), 'utf-8');
    const dirMatch = confData.match(/^dir=(.*)$/m);
    return dirMatch ? dirMatch[1].trim() : DEFAULT_SERVER_PATHS.downloadsDir;
  } catch (error: any) {
    logger.warn(`Aria2 config read skipped: ${error.message}`, { module: 'Downloads' });
    return DEFAULT_SERVER_PATHS.downloadsDir;
  }
}

function createEmptyCounts() {
  return {
    all: 0,
    active: 0,
    waiting: 0,
    paused: 0,
    error: 0,
    completed: 0
  };
}

function buildTaskCounts(tasks: Aria2Task[]) {
  return tasks.reduce((counts, task) => {
    counts.all += 1;
    switch (task.status) {
      case 'active':
        counts.active += 1;
        break;
      case 'waiting':
        counts.waiting += 1;
        break;
      case 'paused':
        counts.paused += 1;
        break;
      case 'error':
        counts.error += 1;
        break;
      case 'complete':
        counts.completed += 1;
        break;
      default:
        break;
    }
    return counts;
  }, createEmptyCounts());
}

function matchesCleanupScope(task: Aria2Task, scope: DownloadCleanupScope) {
  if (scope === 'completed') {
    return task.status === 'complete';
  }
  if (scope === 'failed') {
    return task.status === 'error' || task.status === 'removed';
  }
  return task.status === 'complete' || task.status === 'error' || task.status === 'removed';
}

router.get('/config', async (_req, res) => {
  const dir = await readDownloadDir();
  res.json({ success: true, data: { dir } });
});

router.post('/config', async (req, res) => {
  try {
    const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : '';
    if (!dir) {
      return res.status(400).json({ success: false, error: 'dir is required' });
    }

    await callAria2('aria2.changeGlobalOption', [{ dir }]);

    let confData = '';
    const aria2ConfPath = getAria2ConfPath();
    try {
      confData = await fs.readFile(aria2ConfPath, 'utf-8');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const nextConfData = confData.match(/^dir=.*$/m)
      ? confData.replace(/^dir=.*$/m, `dir=${dir}`)
      : `dir=${dir}${confData ? `\n${confData}` : '\n'}`;

    await fs.mkdir(path.dirname(aria2ConfPath), { recursive: true });
    await fs.writeFile(aria2ConfPath, nextConfData);
    await updateServerPaths({ downloadsDir: dir });

    res.json({ success: true, data: { dir } });
  } catch (error: any) {
    logger.error(`Aria2 config write error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ success: false, error: '保存下载目录失败' });
  }
});

router.get('/status', async (_req, res) => {
  const downloadDir = await readDownloadDir();

  try {
    const [versionInfo, globalStat] = await Promise.all([
      callAria2<{ version?: string }>('aria2.getVersion'),
      callAria2<{ downloadSpeed?: string; numActive?: string; numWaiting?: string; numStopped?: string }>('aria2.getGlobalStat')
    ]);

    res.json({
      success: true,
      data: {
        available: true,
        message: '下载引擎运行正常',
        version: versionInfo?.version || '',
        downloadDir,
        globalStat: {
          downloadSpeed: globalStat?.downloadSpeed || '0',
          numActive: globalStat?.numActive || '0',
          numWaiting: globalStat?.numWaiting || '0',
          numStopped: globalStat?.numStopped || '0'
        }
      }
    });
  } catch (error: any) {
    logger.warn(`Aria2 status unavailable: ${error.message}`, { module: 'Downloads' });
    res.json({
      success: true,
      data: {
        available: false,
        message: '无法连接到下载引擎，请确认 Aria2 正在运行。',
        version: '',
        downloadDir,
        globalStat: {
          downloadSpeed: '0',
          numActive: '0',
          numWaiting: '0',
          numStopped: '0'
        }
      }
    });
  }
});

router.get('/tasks', async (_req, res) => {
  try {
    const [active, waiting, stopped] = await Promise.all([
      callAria2<Aria2Task[]>('aria2.tellActive'),
      callAria2<Aria2Task[]>('aria2.tellWaiting', [0, 1000]),
      callAria2<Aria2Task[]>('aria2.tellStopped', [0, 1000])
    ]);

    const tasks = [...active, ...waiting, ...stopped];

    res.json({
      success: true,
      data: {
        available: true,
        message: '',
        tasks,
        counts: buildTaskCounts(tasks)
      }
    });
  } catch (error: any) {
    logger.warn(`Aria2 tasks unavailable: ${error.message}`, { module: 'Downloads' });
    res.json({
      success: true,
      data: {
        available: false,
        message: '当前无法读取下载任务，请检查下载引擎连接。',
        tasks: [],
        counts: createEmptyCounts()
      }
    });
  }
});

router.post('/create', async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const dir = typeof req.body?.dir === 'string' ? req.body.dir.trim() : '';

    if (!url) {
      return res.status(400).json({ success: false, error: '请填写下载链接' });
    }

    const options = dir ? { dir } : {};
    const gid = await callAria2<string>('aria2.addUri', [[url], options]);
    const isMagnet = url.startsWith('magnet:');

    res.json({
      success: true,
      data: {
        gid,
        statusHint: isMagnet ? '已加入队列，正在获取磁力元数据。' : '已加入下载队列。'
      }
    });
  } catch (error: any) {
    logger.error(`Aria2 create task error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ success: false, error: '创建下载任务失败' });
  }
});

router.post('/task/:gid/action', async (req, res) => {
  try {
    const gid = typeof req.params?.gid === 'string' ? req.params.gid : '';
    const action = req.body?.action as DownloadAction;
    const taskStatus = req.body?.taskStatus as Aria2TaskStatus | undefined;

    if (!gid) {
      return res.status(400).json({ success: false, error: 'gid is required' });
    }

    if (action !== 'pause' && action !== 'resume' && action !== 'remove') {
      return res.status(400).json({ success: false, error: 'invalid action' });
    }

    const method = action === 'pause'
      ? 'aria2.pause'
      : action === 'resume'
        ? 'aria2.unpause'
        : ['complete', 'error', 'removed'].includes(taskStatus || '')
          ? 'aria2.removeDownloadResult'
          : 'aria2.remove';

    await callAria2(method, [gid]);

    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Aria2 task action error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ success: false, error: '执行下载任务操作失败' });
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    const scope = req.body?.scope as DownloadCleanupScope;
    if (scope !== 'completed' && scope !== 'failed' && scope !== 'all-history') {
      return res.status(400).json({ success: false, error: 'invalid cleanup scope' });
    }

    const stopped = await callAria2<Aria2Task[]>('aria2.tellStopped', [0, 1000]);
    const tasksToRemove = stopped.filter((task) => matchesCleanupScope(task, scope));

    for (const task of tasksToRemove) {
      await callAria2('aria2.removeDownloadResult', [task.gid]);
    }

    res.json({
      success: true,
      data: {
        removedCount: tasksToRemove.length,
        scope
      }
    });
  } catch (error: any) {
    logger.error(`Aria2 cleanup error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ success: false, error: '清理下载历史失败' });
  }
});

router.post('/file', async (req, res) => {
  try {
    const filePath = typeof req.body?.filePath === 'string' ? req.body.filePath : '';
    if (!isNonEmptyString(filePath)) {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    if (!filePath.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'absolute path is required' });
    }

    try {
      await fs.unlink(filePath);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return res.json({ success: true, message: 'File already deleted' });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`File deletion error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ success: false, error: '删除本地文件失败' });
  }
});

router.post('/rpc', async (req, res) => {
  try {
    const method = typeof req.body?.method === 'string' ? req.body.method : '';
    const params = Array.isArray(req.body?.params) ? req.body.params : [];

    if (!method) {
      return res.status(400).json({ error: 'method is required' });
    }

    const result = await callAria2(method, params);
    res.json({ result });
  } catch (error: any) {
    logger.error(`Aria2 RPC error: ${error.message}`, { module: 'Downloads' });
    res.status(500).json({ error: 'Failed to connect to download manager. Is Aria2 running?' });
  }
});

export default router;
