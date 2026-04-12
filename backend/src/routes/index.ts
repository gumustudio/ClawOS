import { Router } from 'express';
import { getHardwareStats, getMonitoredServices, getNetworkStats, getOpenClawBackupStatus, getResticBackupStatus, getSecuritySurfaceStatus, getTimeshiftStatus, MonitoredServiceDefinition } from '../utils/probe';
import { logger } from '../utils/logger';
import { getAria2Secret } from '../utils/localServices';

import fs from 'fs/promises';
import path from 'path';
import { createNoteInDir, deleteNoteFromDir, readNotesDir, getNotesTree, saveNoteAsset, updateNoteInDir, createFolder, deleteFolder, renameFolder, moveNote } from '../utils/notesStore';
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../utils/serverConfig';

// Resolve password for health checks
function resolveClawosPassword(): string {
  const envPassword = process.env.CLAWOS_PASSWORD?.trim();
  if (envPassword) {
    return envPassword;
  }

  const homeDir = process.env.HOME?.trim() || require('os').homedir();
  const clawosEnvPath = path.join(homeDir, '.clawos', '.env');
  try {
    const dotenv = require('dotenv');
    const parsedEnv = dotenv.parse(require('fs').readFileSync(clawosEnvPath, 'utf8'));
    return parsedEnv.CLAWOS_PASSWORD?.trim() ?? '';
  } catch {
    return '';
  }
}

const CLAWOS_PASSWORD = resolveClawosPassword();

import downloadRoutes from './downloads';
import netdiskRoutes from './netdisk';
import musicRoutes from './music';
import localmusicRoutes from './localmusic';
import videoRoutes from './video';

import cronRoutes from './cron';
import readerRoutes from './reader';
import configRoutes from './config';
import speedtestRoutes from './speedtest';
import stockAnalysisRoutes from './stock-analysis';
import didaRoutes from './dida';
import notificationsRoutes from './notifications';

const router = Router();

const getNotesDir = async (req: any) => {
  const queryDir = typeof req.query?.dir === 'string' ? req.query.dir : '';
  const bodyDir = typeof req.body?.dir === 'string' ? req.body.dir : '';
  const customDir = queryDir || bodyDir;
  if (customDir) {
    return customDir;
  }
  const paths = await getServerPaths();
  return paths.notesDir;
};

const monitoredServices: MonitoredServiceDefinition[] = [
  {
    id: 'clawos',
    unit: 'clawos.service',
    description: 'ClawOS 主界面和系统入口。它挂了，你看到的整个网页桌面就打不开了。',
    kind: 'core',
    healthCheck: {
      type: 'http',
      url: 'http://127.0.0.1:3001/api/system/hardware',
      expectedText: '"success":true',
      successMessage: '主界面后端接口响应正常'
    }
  },
  {
    id: 'filebrowser',
    unit: 'clawos-filebrowser.service',
    description: 'ClawOS 的文件管理器后台。用来浏览文件、打开目录和管理本机文件。',
    kind: 'core',
    healthCheck: {
      type: 'http',
      url: 'http://127.0.0.1:18790/',
      expectedText: 'File Browser',
      successMessage: '文件管理界面可正常打开'
    }
  },
  {
    id: 'openclaw',
    unit: 'openclaw-gateway.service',
    description: 'OpenClaw AI 网关。负责 AI 对话和相关能力，如果它异常，AI 功能会不可用。',
    kind: 'core',
    healthCheck: {
      type: 'http',
      url: 'http://127.0.0.1:18789/',
      expectedText: 'OpenClaw Control',
      successMessage: 'AI 网关页面可正常访问'
    }
  },
  {
    id: 'aria2',
    unit: 'clawos-aria2.service',
    description: '下载引擎后台。电影、音乐和普通下载任务都要靠它实际执行。',
    kind: 'core',
    healthCheck: {
      type: 'jsonrpc',
      url: 'http://127.0.0.1:6800/jsonrpc',
      method: 'aria2.getVersion',
      params: [`token:${getAria2Secret()}`],
      successMessage: '下载引擎 RPC 响应正常'
    }
  },
  {
    id: 'alist',
    unit: 'clawos-alist.service',
    description: '网盘挂载后台。百度网盘和夸克网盘能否正常浏览、下载，主要看它。',
    kind: 'core',
    healthCheck: {
      type: 'http',
      url: 'http://127.0.0.1:5244/api/public/settings',
      expectedText: 'code',
      successMessage: '网盘挂载后台接口响应正常'
    }
  },
  {
    id: 'display-inhibit',
    unit: 'clawos-display-inhibit.service',
    description: '防休眠保活进程。用于远程使用时尽量避免黑屏、锁屏或显示器进入休眠。',
    kind: 'core'
  },
  {
    id: 'clawos-watchdog',
    unit: 'clawos-watchdog.timer',
    description: 'ClawOS 自动巡检定时器。会定时检查主界面服务是否还活着，并尝试自动修复。',
    kind: 'watchdog'
  },
  {
    id: 'clawos-display-watchdog',
    unit: 'clawos-display-watchdog.timer',
    description: '远程显示巡检定时器。会定时检查远程显示保活是否正常，减少远程黑屏问题。',
    kind: 'watchdog'
  },
  {
    id: 'openclaw-watchdog',
    unit: 'openclaw-watchdog.timer',
    description: 'OpenClaw 自动巡检定时器。会定时检查 AI 网关是否正常，并在异常时尝试修复。',
    kind: 'watchdog'
  }
];

// /api/system/network
router.get('/network', async (req, res) => {
  try {
    const stats = await getNetworkStats();
    res.json({ success: true, data: stats, error: null });
  } catch (error: any) {
    logger.error(`Network Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

// /api/system/hardware
router.get('/hardware', async (req, res) => {
  try {
    const stats = await getHardwareStats();
    res.json({ success: true, data: stats, error: null });
  } catch (error: any) {
    logger.error(`Hardware Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

// /api/system/services
router.get('/services', async (req, res) => {
  try {
    const services = await getMonitoredServices(monitoredServices, CLAWOS_PASSWORD);

    res.json({ success: true, data: services, error: null });
  } catch (error: any) {
    logger.error(`Services Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

// /api/system/timeshift
router.get('/timeshift', async (req, res) => {
  try {
    const status = await getTimeshiftStatus();
    res.json({ success: true, data: status, error: null });
  } catch (error: any) {
    logger.error(`Timeshift Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

router.get('/openclaw-backup', async (_req, res) => {
  try {
    const status = await getOpenClawBackupStatus();
    res.json({ success: true, data: status, error: null });
  } catch (error: any) {
    logger.error(`OpenClaw Backup Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

router.get('/restic-backup', async (_req, res) => {
  try {
    const status = await getResticBackupStatus();
    res.json({ success: true, data: status, error: null });
  } catch (error: any) {
    logger.error(`Restic Backup Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

router.get('/security-surface', async (_req, res) => {
  try {
    const status = await getSecuritySurfaceStatus();
    res.json({ success: true, data: status, error: null });
  } catch (error: any) {
    logger.error(`Security Surface Probe Error: ${error.message}`, { module: 'SystemProbe' });
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

// --- Notes API ---
// /api/system/notes
router.get('/notes', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const notes = await readNotesDir(notesDir);
    res.json({ success: true, data: notes });
  } catch (error: any) {
    logger.error(`Notes Read Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/notes/tree', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const tree = await getNotesTree(notesDir);
    res.json({ success: true, data: tree });
  } catch (error: any) {
    logger.error(`Notes Tree Read Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const newNote = {
      id: Date.now().toString(),
      title: req.body.title || '无标题笔记',
      date: new Date().toISOString().split('T')[0],
      content: req.body.content || '',
      updatedAt: new Date().toISOString(),
      folder: req.body.folder || ''
    };

    const createdNote = await createNoteInDir(notesDir, newNote);
    
    res.json({ success: true, data: createdNote });
  } catch (error: any) {
    logger.error(`Notes Create Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/notes/folders', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const folderPath = req.body.path;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'Folder path is required' });
    }

    await createFolder(notesDir, folderPath);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Notes Folder Create Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notes/folders/rename', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ success: false, error: 'Both oldPath and newPath are required' });
    }

    await renameFolder(notesDir, oldPath, newPath);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Notes Folder Rename Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/notes/folders', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const folderPath = req.body.path || req.query.path;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'Folder path is required' });
    }

    await deleteFolder(notesDir, folderPath as string);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Notes Folder Delete Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notes/:id/move', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const newFolder = req.body.folder || '';
    
    const movedNote = await moveNote(notesDir, req.params.id, newFolder);
    if (!movedNote) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    res.json({ success: true, data: movedNote });
  } catch (error: any) {
    logger.error(`Notes Move Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    const notes = await readNotesDir(notesDir);

    const index = notes.findIndex((n: any) => n.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    const updatedNote = {
      ...notes[index],
      title: req.body.title !== undefined ? req.body.title : notes[index].title,
      content: req.body.content !== undefined ? req.body.content : notes[index].content,
      folder: req.body.folder !== undefined ? req.body.folder : notes[index].folder,
      updatedAt: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0]
    };

    const savedNote = await updateNoteInDir(notesDir, updatedNote);
    res.json({ success: true, data: savedNote });
  } catch (error: any) {
    logger.error(`Notes Update Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    const notesDir = await getNotesDir(req);
    await deleteNoteFromDir(notesDir, req.params.id);
    
    res.json({ success: true });
  } catch (error: any) {
    logger.error(`Notes Delete Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/notes/migrate', async (req, res) => {
  const fromDir = req.body.fromDir || '';
  const toDir = req.body.toDir || '';

  if (!toDir) {
    return res.status(400).json({ success: false, error: 'Target notes directory is required' });
  }

  const serverPaths = await getServerPaths();
  const fromNotesDir = fromDir || serverPaths.notesDir || DEFAULT_SERVER_PATHS.notesDir;
  const toNotesDir = toDir;

  try {
    const [sourceNotes, targetNotes] = await Promise.all([
      readNotesDir(fromNotesDir),
      readNotesDir(toNotesDir)
    ]);

    const noteMap = new Map<string, any>();
    [...targetNotes, ...sourceNotes].forEach((note: any) => {
      noteMap.set(note.id, note);
    });

    const mergedNotes = [...noteMap.values()].sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

    await Promise.all(mergedNotes.map((note) => updateNoteInDir(toNotesDir, note)));

    res.json({ success: true, data: { migrated: sourceNotes.length, total: mergedNotes.length } });
  } catch (error: any) {
    logger.error(`Notes Migrate Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/notes/assets', async (req, res) => {
  const fileName = req.body.fileName || '';
  const data = req.body.data || '';

  if (!fileName || !data) {
    return res.status(400).json({ success: false, error: 'fileName and data are required' });
  }

  try {
    const notesDir = await getNotesDir(req);
    const asset = await saveNoteAsset(notesDir, fileName, data);
    res.json({ success: true, data: asset });
  } catch (error: any) {
    logger.error(`Notes Asset Save Error: ${error.message}`, { module: 'Notes' });
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Downloads API ---
router.use('/downloads', downloadRoutes);

// --- Netdisk API ---
router.use('/netdisk', netdiskRoutes);

// --- Music API ---
router.use('/music', musicRoutes);

// --- Local Music API ---
router.use('/localmusic', localmusicRoutes);

// --- Video API ---
router.use('/video', videoRoutes);

// --- Cron API ---
router.use('/cron', cronRoutes);

// --- Reader API ---
router.use('/reader', readerRoutes);

// --- Config API ---
router.use('/config', configRoutes);

// --- Speedtest API ---
router.use('/speedtest', speedtestRoutes);

// --- Stock Analysis API ---
router.use('/stock-analysis', stockAnalysisRoutes);

// --- Dida API ---
router.use('/dida', didaRoutes);

// --- Notifications API ---
router.use('/notifications', notificationsRoutes);

export default router;
