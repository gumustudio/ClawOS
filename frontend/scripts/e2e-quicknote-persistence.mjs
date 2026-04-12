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
  const noteText = `quick-note-${Date.now()}`;

  try {
    await saveUiConfig(api, { ...originalUi, showWidgets: true, quickNote: '' });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const quickNote = page.getByPlaceholder('记录一闪而过的想法...').first();
    await pollUntil(async () => {
      return await quickNote.isVisible().catch(() => false);
    }, '桌面灵感速记输入框未出现');

    await quickNote.fill(noteText);

    await pollUntil(async () => {
      const latestUi = await getUiConfig(api);
      return latestUi.quickNote === noteText;
    }, '输入灵感速记后，服务端 quickNote 未更新', 10000);

    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });

    const reloadedQuickNote = page.getByPlaceholder('记录一闪而过的想法...').first();
    await pollUntil(async () => {
      return await reloadedQuickNote.isVisible().catch(() => false);
    }, '刷新后灵感速记输入框未出现');
    const currentValue = await reloadedQuickNote.inputValue();
    if (currentValue !== noteText) {
      fail(`刷新后灵感速记未恢复，当前值: ${currentValue}`);
    }

    if (pageErrors.length > 0) {
      fail(`页面运行错误: ${pageErrors.join(' | ')}`);
    }

    const importantConsoleErrors = consoleErrors.filter((message) => {
      if (message.includes('favicon')) {
        return false;
      }
      if (message.includes('Failed to save widget UI config') && message.includes('Failed to fetch')) {
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
        'quicknote-save-persist',
        'quicknote-reload-from-server'
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
