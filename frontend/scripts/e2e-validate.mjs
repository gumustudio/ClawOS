import { chromium } from 'playwright';

import os from 'os';
import path from 'path';

const baseUrl = process.env.CLAWOS_BASE_URL || 'http://127.0.0.1:3001';
const localMusicDir = process.env.CLAWOS_LOCAL_MUSIC_DIR || path.join(os.homedir(), '音乐');

function fail(message) {
  throw new Error(message);
}

async function expectVisible(locator, message, timeout = 15000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => fail(message));
}

async function openDesktopApp(page, appName) {
  const icon = page.locator('span').filter({ hasText: appName }).first();
  await expectVisible(icon, `桌面图标不可见: ${appName}`);
  await icon.click();
}

async function minimizeActiveWindow(page) {
  const minimizeButton = page.locator('svg.lucide-minus').first().locator('xpath=..');
  await expectVisible(minimizeButton, '窗口最小化按钮不可见');
  await minimizeButton.click();
}

async function expectAnyVisible(locators, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(message);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1100 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript((musicDir) => {
    window.localStorage.setItem('clawos-localmusic-dir', musicDir);
  }, localMusicDir);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('ClawOS').first(), 'ClawOS 首页未正常加载');

  await openDesktopApp(page, '本地音乐');
  await expectVisible(page.getByText('本地音乐 Pro'), '本地音乐窗口未打开');
  await expectVisible(page.getByRole('button', { name: '扫描目录' }), '本地音乐扫描按钮未出现');
  await page.getByRole('button', { name: '扫描目录' }).click();

  const scanToast = page.locator('text=扫描完成').first();
  await expectVisible(scanToast, '本地音乐扫描未完成', 30000);
  await expectVisible(page.locator('text=缓存补全').or(page.locator('text=云端补全')).or(page.locator('text=混合信息')).first(), '本地音乐元数据补全标签未出现', 15000);
  await expectVisible(page.locator('text=送情郎 - 岳云鹏').first(), '未找到本地歌曲“送情郎 - 岳云鹏”');

  const localTrackRow = page.locator('div').filter({ has: page.locator('text=送情郎 - 岳云鹏') }).first();
  await localTrackRow.dblclick();
  await expectVisible(page.locator('text=岳云鹏').first(), '本地歌曲播放后未显示歌手信息');

  await minimizeActiveWindow(page);
  await openDesktopApp(page, '网易云');
  await expectAnyVisible([
    page.getByText('网易云音乐').first(),
    page.getByPlaceholder('搜索歌手、歌曲、专辑...')
  ], '网易云窗口未打开');

  const searchInput = page.getByPlaceholder('搜索歌手、歌曲、专辑...');
  await expectVisible(searchInput, '网易云搜索框未出现');
  await searchInput.fill('送情郎');
  await page.getByRole('button', { name: '搜索' }).click();

  await expectVisible(page.locator('text=搜索结果').first(), '网易云搜索结果未出现');
  await expectVisible(page.locator('text=送情郎').first(), '网易云搜索未返回“送情郎”');

  const musicRow = page.locator('div').filter({ has: page.locator('text=送情郎') }).first();
  await musicRow.dblclick();
  await expectVisible(page.locator('text=岳云鹏').first(), '网易云播放后未显示歌手信息');

  if (pageErrors.length > 0) {
    fail(`页面运行错误: ${pageErrors.join(' | ')}`);
  }

  const importantConsoleErrors = consoleErrors.filter((message) => !message.includes('favicon'));
  if (importantConsoleErrors.length > 0) {
    fail(`控制台错误: ${importantConsoleErrors.join(' | ')}`);
  }

  console.log(JSON.stringify({
    success: true,
    validated: [
      'localmusic-scan',
      'localmusic-metadata-badge',
      'localmusic-playback-ui',
      'netease-search',
      'netease-playback-ui'
    ]
  }, null, 2));

  await browser.close();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
