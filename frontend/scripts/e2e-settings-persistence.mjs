import { chromium, request as playwrightRequest } from 'playwright';

const rawBaseUrl = process.env.CLAWOS_BASE_URL || 'http://127.0.0.1:3001';
const baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;
const parsedBaseUrl = new URL(baseUrl);
const appBasePath = parsedBaseUrl.pathname.startsWith('/clawos') ? '/clawos' : '';
const origin = `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`;

function fail(message) {
  throw new Error(message);
}

async function expectVisible(locator, message, timeout = 15000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => fail(message));
}

async function pollUntil(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(message);
}

async function getUiConfig(api) {
  const response = await api.get(`${appBasePath}/api/system/config/ui`);
  if (!response.ok()) {
    fail(`读取 UI 配置失败: ${response.status()}`);
  }
  const json = await response.json();
  if (!json.success) {
    fail(`读取 UI 配置失败: ${json.error || 'unknown error'}`);
  }
  return json.data;
}

async function saveUiConfig(api, nextUi) {
  const response = await api.post(`${appBasePath}/api/system/config/ui`, {
    data: nextUi,
  });
  if (!response.ok()) {
    fail(`保存 UI 配置失败: ${response.status()}`);
  }
  const json = await response.json();
  if (!json.success) {
    fail(`保存 UI 配置失败: ${json.error || 'unknown error'}`);
  }
  return json.data;
}

async function openSettings(page) {
  const settingsButton = page.locator('svg.lucide-settings').first().locator('xpath=..');
  await expectVisible(settingsButton, '系统设置按钮不可见');
  await settingsButton.click();
  await expectVisible(page.getByText('系统设置').first(), '系统设置弹窗未打开');
}

async function selectWallpaper(page) {
  const wallpaperTiles = page.locator('.grid.grid-cols-5 > div');
  const targetTile = wallpaperTiles.nth(1);
  await expectVisible(targetTile, '壁纸选择项不可见');
  await targetTile.click();
}

async function run() {
  const api = await playwrightRequest.newContext({ baseURL: origin });
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

  const originalUi = await getUiConfig(api);
  const targetWallpaper = 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2560&auto=format&fit=crop';
  const testUi = {
    ...originalUi,
    autoHideDock: false,
    showWidgets: false,
    wallpaper: '',
  };

  try {
    await saveUiConfig(api, testUi);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await expectVisible(page.getByText('ClawOS').first(), 'ClawOS 首页未正常加载');
    await pollUntil(async () => {
      const latestUi = await getUiConfig(api);
      if (latestUi.showWidgets !== false) {
        return false;
      }
      return !(await page.getByText('灵感速记').first().isVisible().catch(() => false));
    }, 'Widgets 未在读取到服务端配置后隐藏');

    await openSettings(page);
    await selectWallpaper(page);

    await pollUntil(async () => {
      const latestUi = await getUiConfig(api);
      return latestUi.wallpaper === targetWallpaper;
    }, '设置页修改壁纸后，服务端配置未更新');

    await page.waitForTimeout(1000);

    await page.reload({ waitUntil: 'networkidle' });
    await pollUntil(async () => {
      const backgroundImage = await page.locator('div.absolute.inset-0.bg-cover.bg-center.z-0').evaluate((element) => {
        return window.getComputedStyle(element).backgroundImage;
      });
      return backgroundImage.includes('photo-1550684848-fac1c5b4e853');
    }, '刷新后桌面壁纸未按服务端配置恢复');

    if (pageErrors.length > 0) {
      fail(`页面运行错误: ${pageErrors.join(' | ')}`);
    }

    const importantConsoleErrors = consoleErrors.filter((message) => {
      if (message.includes('favicon')) {
        return false;
      }
      if (message.includes('Failed to save server UI config') && message.includes('Failed to fetch')) {
        return false;
      }
      return true;
    });
    if (importantConsoleErrors.length > 0) {
      fail(`控制台错误: ${importantConsoleErrors.join(' | ')}`);
    }

    console.log(JSON.stringify({
      success: true,
      validated: [
        'server-ui-init',
        'settings-save-persist',
        'page-reload-uses-server-ui'
      ]
    }, null, 2));
  } finally {
    await saveUiConfig(api, originalUi).catch(() => {});
    await api.dispose();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
