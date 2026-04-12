import fs from 'fs/promises';
import path from 'path';

import os from 'os';

function getConfigFile() {
  return path.join(process.env.HOME || os.homedir(), '.clawos', 'config.json');
}

export interface PathConfig {
  downloadsDir: string;
  musicDownloadsDir: string;
  localMusicDir: string;
  notesDir: string;
  readerDir: string;
  stockAnalysisDir: string;
  videoDownloadsDir: string;
}

export interface ServerConfig {
  paths: PathConfig;
  ui: ServerUiConfig;
  [key: string]: unknown;
}

export interface ServerUiConfig {
  dockSize: number;
  autoHideDock: boolean;
  defaultFullscreen: boolean;
  wallpaper: string;
  showWidgets: boolean;
  dockHideDelay: number;
  stickyNotifications: boolean;
  musicQuality: string;
  quickNote: string;
}

function buildDefaultPaths(): PathConfig {
  const home = os.homedir();
  return {
    downloadsDir: path.join(home, '下载'),
    musicDownloadsDir: path.join(home, '音乐'),
    localMusicDir: path.join(home, '音乐'),
    notesDir: path.join(home, '文档', '随手小记'),
    readerDir: path.join(home, '文档', 'RSS资讯'),
    stockAnalysisDir: path.join(home, '文档', 'AI炒股分析'),
    videoDownloadsDir: path.join(home, '视频'),
  };
}

export const DEFAULT_SERVER_PATHS: PathConfig = buildDefaultPaths();

export const DEFAULT_SERVER_UI = {
  dockSize: 48,
  autoHideDock: false,
  defaultFullscreen: false,
  wallpaper: '',
  showWidgets: true,
  dockHideDelay: 2,
  stickyNotifications: false,
  musicQuality: 'lossless',
  quickNote: ''
};

function normalizeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeUiConfig(raw: unknown): ServerUiConfig {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  return {
    dockSize: normalizeNumber(parsed.dockSize, DEFAULT_SERVER_UI.dockSize),
    autoHideDock: normalizeBoolean(parsed.autoHideDock, DEFAULT_SERVER_UI.autoHideDock),
    defaultFullscreen: normalizeBoolean(parsed.defaultFullscreen, DEFAULT_SERVER_UI.defaultFullscreen),
    wallpaper: normalizeString(parsed.wallpaper, DEFAULT_SERVER_UI.wallpaper),
    showWidgets: normalizeBoolean(parsed.showWidgets, DEFAULT_SERVER_UI.showWidgets),
    dockHideDelay: normalizeNumber(parsed.dockHideDelay, DEFAULT_SERVER_UI.dockHideDelay),
    stickyNotifications: normalizeBoolean(parsed.stickyNotifications, DEFAULT_SERVER_UI.stickyNotifications),
    musicQuality: normalizeString(parsed.musicQuality, DEFAULT_SERVER_UI.musicQuality),
    quickNote: normalizeString(parsed.quickNote, DEFAULT_SERVER_UI.quickNote)
  };
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeConfig(raw: unknown): ServerConfig {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawPaths = parsed.paths && typeof parsed.paths === 'object' ? parsed.paths as Record<string, unknown> : {};
  const rawUi = parsed.ui && typeof parsed.ui === 'object' ? parsed.ui as Record<string, unknown> : {};

  return {
    ...parsed,
    paths: {
      downloadsDir: normalizeString(rawPaths.downloadsDir, DEFAULT_SERVER_PATHS.downloadsDir),
      musicDownloadsDir: normalizeString(rawPaths.musicDownloadsDir, DEFAULT_SERVER_PATHS.musicDownloadsDir),
      localMusicDir: normalizeString(rawPaths.localMusicDir, DEFAULT_SERVER_PATHS.localMusicDir),
      notesDir: normalizeString(rawPaths.notesDir, DEFAULT_SERVER_PATHS.notesDir),
      readerDir: normalizeString(rawPaths.readerDir, DEFAULT_SERVER_PATHS.readerDir),
      stockAnalysisDir: normalizeString(rawPaths.stockAnalysisDir, DEFAULT_SERVER_PATHS.stockAnalysisDir),
      videoDownloadsDir: normalizeString(rawPaths.videoDownloadsDir, DEFAULT_SERVER_PATHS.videoDownloadsDir)
    },
    ui: normalizeUiConfig(rawUi)
  };
}

export async function loadServerConfig(): Promise<ServerConfig> {
  try {
    const data = await fs.readFile(getConfigFile(), 'utf-8');
    return normalizeConfig(JSON.parse(data));
  } catch {
    return normalizeConfig({});
  }
}

export async function saveServerConfig(nextConfig: Partial<ServerConfig>) {
  const current = await loadServerConfig();
  const nextPaths = nextConfig.paths || {};
  const merged = normalizeConfig({
    ...current,
    ...nextConfig,
    paths: {
      ...current.paths,
      ...nextPaths
    }
  });

  const configFile = getConfigFile();
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return merged;
}

export async function getServerPaths() {
  const config = await loadServerConfig();
  return config.paths;
}

export async function updateServerPaths(paths: Partial<PathConfig>) {
  const updated = await saveServerConfig({ paths } as Partial<ServerConfig>);
  return updated.paths;
}

export async function getServerUiConfig(): Promise<ServerUiConfig> {
  const config = await loadServerConfig();
  return config.ui;
}

export async function updateServerUiConfig(ui: Partial<ServerUiConfig>): Promise<ServerUiConfig> {
  const current = await loadServerConfig();
  const updated = await saveServerConfig({
    ...current,
    ui: {
      ...current.ui,
      ...ui
    }
  });
  return updated.ui;
}
