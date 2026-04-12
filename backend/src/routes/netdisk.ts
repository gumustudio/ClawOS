import { Router } from 'express';
import { logger } from '../utils/logger';
import { getAlistAdminPassword, getAlistAdminUsername, getAlistUrl, getAria2RpcUrl, getAria2Secret } from '../utils/localServices';

const router = Router();

type NetdiskBrand = 'baidu' | 'quark';

interface AListStorageRecord {
  id: number;
  mount_path: string;
  driver: string;
  status?: string;
  addition?: string;
}

interface AListApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

let alistToken = '';

async function getAlistToken() {
  if (alistToken) return alistToken;
  try {
    const res = await fetch(`${getAlistUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: getAlistAdminUsername(), password: getAlistAdminPassword() })
    });
    const data = await res.json();
    if (data.code === 200) {
      alistToken = data.data.token;
      return alistToken;
    }
  } catch (e) {
    logger.error('Failed to get AList token', { module: 'Netdisk' });
  }
  return '';
}

async function listAListPath(targetPath: string) {
  const token = await getAlistToken();
  if (!token) {
    return {
      ok: false as const,
      reason: 'auth_failed' as const,
      message: '无法登录到底层挂载后台 AList，请先确认 AList 已启动且管理员密码仍为默认值。'
    };
  }

  try {
    const response = await fetch(`${getAlistUrl()}/api/fs/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({ path: targetPath, password: '', page: 1, per_page: 0, refresh: false })
    });

    const data = await response.json();
    if (data.code === 401 || data.code === 403) {
      alistToken = '';
      return {
        ok: false as const,
        reason: 'auth_expired' as const,
        message: 'AList 登录状态已失效，请重新进入底层挂载后台后再试。'
      };
    }

    if (data.code === 200) {
      return {
        ok: true as const,
        content: data.data?.content || []
      };
    }

    const message = String(data.message || '').toLowerCase();
    if (message.includes('object not found') || message.includes('not found') || message.includes('file not found')) {
      return {
        ok: false as const,
        reason: 'not_mounted' as const,
        message: `尚未检测到挂载点 ${targetPath}，说明 ${targetPath === '/baidu' ? '百度网盘' : '夸克网盘'} 还没有在 AList 中配置完成。`
      };
    }

    return {
      ok: false as const,
      reason: 'alist_error' as const,
      message: String(data.message || 'AList 返回了未知错误')
    };
  } catch (error: any) {
    logger.error(`AList API Error: ${error.message}`, { module: 'Netdisk' });
    return {
      ok: false as const,
      reason: 'alist_unreachable' as const,
      message: '无法连接到底层挂载后台 AList，请先确认 AList 服务正在运行。'
    };
  }
}

async function alistAdminRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const token = await getAlistToken();
  if (!token) {
    throw new Error('无法登录到底层挂载后台 AList');
  }

  const response = await fetch(`${getAlistUrl()}${pathname}`, {
    ...init,
    headers: {
      'Authorization': token,
      ...(init?.headers || {})
    }
  });

  const data = await response.json();
  if (data.code === 401 || data.code === 403) {
    alistToken = '';
    throw new Error('AList 登录状态已失效，请稍后重试');
  }

  if (data.code !== 200) {
    throw new Error(String(data.message || 'AList 管理接口返回了未知错误'));
  }

  return data as T;
}

async function getStorageByMountPath(targetPath: string): Promise<AListStorageRecord | null> {
  const response = await alistAdminRequest<{ code: number; data: { content: AListStorageRecord[] } }>(
    `/api/admin/storage/list?page=1&per_page=200`
  );

  return response.data.content.find((item) => item.mount_path === targetPath) || null;
}

async function deleteStorageById(id: number) {
  await alistAdminRequest(`/api/admin/storage/delete?id=${id}`, {
    method: 'POST'
  });
}

function buildStoragePayload(brand: NetdiskBrand, credential: string) {
  if (brand === 'baidu') {
    return {
      driver: 'BaiduNetdisk',
      mount_path: '/baidu',
      order: 0,
      remark: 'Configured by ClawOS',
      cache_expiration: 30,
      web_proxy: false,
      webdav_policy: '302_redirect',
      down_proxy_url: '',
      extract_folder: '',
      enable_sign: false,
      addition: JSON.stringify({
        refresh_token: credential,
        root_folder_path: '/',
        order_by: 'name',
        order_direction: 'asc',
        download_api: 'official',
        client_id: process.env.BAIDU_NETDISK_CLIENT_ID || '',
        client_secret: process.env.BAIDU_NETDISK_CLIENT_SECRET || '',
        custom_crack_ua: 'netdisk',
        upload_thread: '3',
        upload_api: 'https://d.pcs.baidu.com'
      })
    };
  }

  return {
    driver: 'Quark',
    mount_path: '/quark',
    order: 0,
    remark: 'Configured by ClawOS',
    cache_expiration: 30,
    webdav_policy: 'native_proxy',
    down_proxy_url: '',
    extract_folder: '',
    enable_sign: false,
    order_by: 'none',
    order_direction: 'asc',
    addition: JSON.stringify({
      cookie: credential,
      root_folder_id: '0',
      order_by: 'none',
      order_direction: 'asc'
    })
  };
}

async function configureStorage(brand: NetdiskBrand, credential: string) {
  const targetPath = brand === 'baidu' ? '/baidu' : '/quark';
  const existing = await getStorageByMountPath(targetPath);
  if (existing) {
    await deleteStorageById(existing.id);
  }

  const payload = buildStoragePayload(brand, credential);
  const token = await getAlistToken();
  if (!token) {
    throw new Error('无法登录到底层挂载后台 AList');
  }

  const response = await fetch(`${getAlistUrl()}/api/admin/storage/create`, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json() as AListApiResponse<{ id: number }>;
  if ((data.code === 401 || data.code === 403)) {
    alistToken = '';
    throw new Error('AList 登录状态已失效，请稍后重试');
  }

  if (data.code !== 200 && !data.data?.id) {
    throw new Error(String(data.message || 'AList 管理接口返回了未知错误'));
  }

  if (data.code !== 200) {
    logger.warn(`AList storage create returned ${data.code}: ${data.message}`, { module: 'Netdisk' });
  }

  return data;
}

router.get('/status', async (req, res) => {
  const brand = req.query.brand === 'quark' ? 'quark' : 'baidu';
  const targetPath = brand === 'baidu' ? '/baidu' : '/quark';
  const result = await listAListPath(targetPath);

  if (result.ok) {
    return res.json({
      success: true,
      data: {
        brand,
        targetPath,
        mounted: true,
        status: 'mounted',
        itemCount: result.content.length,
        alistAdmin: {
          username: getAlistAdminUsername(),
          password: getAlistAdminPassword()
        },
        localOnlyAdmin: true
      }
    });
  }

  return res.json({
    success: true,
    data: {
      brand,
      targetPath,
      mounted: false,
      status: result.reason,
      message: result.message,
      alistAdmin: {
        username: getAlistAdminUsername(),
        password: getAlistAdminPassword()
      },
      localOnlyAdmin: true
    }
  });
});

router.get('/files', async (req, res) => {
  const targetPath = req.query.path as string || '/';
  const result = await listAListPath(targetPath);

  if (!result.ok) {
    return res.json({ success: false, error: result.message });
  }

  res.json({ success: true, data: result.content });
});

router.post('/configure', async (req, res) => {
  const brand: NetdiskBrand = req.body?.brand === 'quark' ? 'quark' : 'baidu';
  const rawCredential = brand === 'baidu' ? req.body?.refreshToken : req.body?.cookie;
  const credential = typeof rawCredential === 'string' ? rawCredential.trim() : '';

  if (!credential) {
    return res.status(400).json({
      success: false,
      error: brand === 'baidu' ? '请填写百度网盘 refresh_token' : '请填写夸克网盘 cookie'
    });
  }

  try {
    const createResult = await configureStorage(brand, credential);
    const targetPath = brand === 'baidu' ? '/baidu' : '/quark';
    const status = await listAListPath(targetPath);

    return res.json({
      success: true,
      data: {
        brand,
        targetPath,
        storageId: createResult.data.id,
        mounted: status.ok,
        message: status.ok ? '网盘挂载已自动配置完成' : status.message
      }
    });
  } catch (error: any) {
    logger.error(`Configure netdisk failed: ${error.message}`, { module: 'Netdisk' });
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/download', async (req, res) => {
  const { path } = req.body;
  const token = await getAlistToken();
  
  try {
    const response = await fetch(`${getAlistUrl()}/api/fs/get`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({ path, password: '' })
    });
    const data = await response.json();
    
    if (data.code === 200) {
      // Send this to Aria2 directly
      const downloadUrl = data.data.raw_url;
      const aria2Res = await fetch(getAria2RpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now().toString(),
          method: 'aria2.addUri',
          params: [`token:${getAria2Secret()}`, [downloadUrl]]
        })
      });
      const aria2Data = await aria2Res.json();
      res.json({ success: true, data: aria2Data });
    } else {
      res.json({ success: false, error: data.message });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
