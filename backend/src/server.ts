import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import httpProxy from 'http-proxy';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import apiRoutes from './routes/index';
import { logger } from './utils/logger';
import { clearQuarkAuthSession, getCachedQuarkAuthSession, readQuarkAuthSession, updateQuarkAuthSession } from './utils/quarkAuth';
import { initCronJobs } from './routes/cron';
import { initReaderScheduler } from './services/reader/scheduler';
import { initStockAnalysisScheduler } from './services/stock-analysis/scheduler';

dotenv.config();

void initCronJobs();
initReaderScheduler();
initStockAnalysisScheduler();

const app = express();
const PORT = process.env.PORT || 3001;
const OPENCLAW_TARGET = 'http://127.0.0.1:18789';
const OPENCLAW_WS_TARGET = 'ws://127.0.0.1:18789';
const FILEBROWSER_TARGET = 'http://127.0.0.1:18790';
const FILEBROWSER_BASE_PATH = '/proxy/filebrowser';
const FILEBROWSER_INLINE_STYLE = '<style>.search-button{display:none!important;}</style>';
const FILEBROWSER_AUTH_COOKIE = 'clawos_filebrowser_auth';
const MEDIA_AUTH_COOKIE = 'clawos_media_auth';
const QUARK_AUTH_TARGET = 'https://pan.quark.cn';
const QUARK_UOP_TARGET = 'https://uop.quark.cn';
const OPENCLAW_TRUSTED_PROXY_USER = 'clawos';

function resolveOpenClawGatewayToken(): string {
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const homeDir = process.env.HOME?.trim() || os.homedir();
  const openClawEnvPath = path.join(homeDir, '.openclaw', '.env');
  try {
    const parsedEnv = dotenv.parse(fs.readFileSync(openClawEnvPath, 'utf8'));
    return parsedEnv.OPENCLAW_GATEWAY_TOKEN?.trim() ?? '';
  } catch {
    return '';
  }
}

const OPENCLAW_GATEWAY_TOKEN = resolveOpenClawGatewayToken();

function resolveClawosPassword(): string {
  const envPassword = process.env.CLAWOS_PASSWORD?.trim();
  if (envPassword) {
    return envPassword;
  }

  const homeDir = process.env.HOME?.trim() || os.homedir();
  const clawosEnvPath = path.join(homeDir, '.clawos', '.env');
  try {
    const parsedEnv = dotenv.parse(fs.readFileSync(clawosEnvPath, 'utf8'));
    return parsedEnv.CLAWOS_PASSWORD?.trim() ?? '';
  } catch {
    return '';
  }
}

const CLAWOS_PASSWORD = resolveClawosPassword();
const FILEBROWSER_COOKIE_SECRET = CLAWOS_PASSWORD
  ? crypto.createHash('sha256').update(`filebrowser:${CLAWOS_PASSWORD}`).digest('hex')
  : '';
const MEDIA_COOKIE_SECRET = CLAWOS_PASSWORD
  ? crypto.createHash('sha256').update(`media:${CLAWOS_PASSWORD}`).digest('hex')
  : '';

function getExpectedFileBrowserCookieValue(): string {
  return FILEBROWSER_COOKIE_SECRET;
}

function hasValidFileBrowserCookie(req: express.Request): boolean {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader || !FILEBROWSER_COOKIE_SECRET) {
    return false;
  }

  const cookies = cookieHeader.split(';');
  for (const rawCookie of cookies) {
    const trimmedCookie = rawCookie.trim();
    if (!trimmedCookie.startsWith(`${FILEBROWSER_AUTH_COOKIE}=`)) {
      continue;
    }

    const cookieValue = decodeURIComponent(trimmedCookie.slice(FILEBROWSER_AUTH_COOKIE.length + 1));
    return cookieValue === getExpectedFileBrowserCookieValue();
  }

  return false;
}

function hasValidCookie(req: express.Request, cookieName: string, expectedValue: string): boolean {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader || !expectedValue) {
    return false;
  }

  const cookies = cookieHeader.split(';');
  for (const rawCookie of cookies) {
    const trimmedCookie = rawCookie.trim();
    if (!trimmedCookie.startsWith(`${cookieName}=`)) {
      continue;
    }

    const cookieValue = decodeURIComponent(trimmedCookie.slice(cookieName.length + 1));
    return cookieValue === expectedValue;
  }

  return false;
}

function isFileBrowserProxyRequest(req: express.Request): boolean {
  return req.originalUrl.startsWith('/proxy/filebrowser') || req.originalUrl.startsWith('/clawos/proxy/filebrowser');
}

function isPublicDidaCallbackRequest(req: express.Request): boolean {
  return req.originalUrl.startsWith('/api/system/dida/callback') || req.originalUrl.startsWith('/clawos/api/system/dida/callback');
}

function isMediaStreamRequest(req: express.Request): boolean {
  return (
    req.originalUrl.startsWith('/api/system/music/stream_local') ||
    req.originalUrl.startsWith('/clawos/api/system/music/stream_local') ||
    req.originalUrl.startsWith('/api/system/localmusic/stream/') ||
    req.originalUrl.startsWith('/clawos/api/system/localmusic/stream/')
  );
}

function buildFileBrowserAuthCookie(req: express.Request): string {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieParts = [
    `${FILEBROWSER_AUTH_COOKIE}=${encodeURIComponent(getExpectedFileBrowserCookieValue())}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

function buildMediaAuthCookie(req: express.Request): string {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieParts = [
    `${MEDIA_AUTH_COOKIE}=${encodeURIComponent(MEDIA_COOKIE_SECRET)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

// Create auth middleware - checks Basic Auth header but doesn't prompt browser (frontend handles login UI)
const authMiddleware = CLAWOS_PASSWORD
  ? (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isPublicDidaCallbackRequest(req)) {
        return next();
      }

      if (isFileBrowserProxyRequest(req) && hasValidFileBrowserCookie(req)) {
        return next();
      }

      if (isMediaStreamRequest(req) && hasValidCookie(req, MEDIA_AUTH_COOKIE, MEDIA_COOKIE_SECRET)) {
        return next();
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      try {
        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const [username, password] = credentials.split(':');
        if (username === 'clawos' && password === CLAWOS_PASSWORD) {
          return next();
        }
      } catch {
        // Invalid base64
      }
      
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

function getQuarkProxyBasePath(requestPath: string): string {
  return requestPath.startsWith('/clawos/') ? '/clawos' : '';
}

function injectQuarkRequestRewrite(html: string, requestPath: string): string {
  const proxyBasePath = getQuarkProxyBasePath(requestPath);
  const marker = '</head>';
  const rewriteScript = `<script>(function(){const authPrefix='${proxyBasePath}/proxy/quark-auth';const uopPrefix='${proxyBasePath}/proxy/quark-auth-uop';const rewriteUrl=(input)=>{if(typeof input!=='string'){return input;}if(input.startsWith('https://pan.quark.cn/')){return input.replace('https://pan.quark.cn',authPrefix);}if(input.startsWith('https://uop.quark.cn/')){return input.replace('https://uop.quark.cn',uopPrefix);}return input;};const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(typeof input==='string'){return originalFetch(rewriteUrl(input),init);}if(input instanceof Request){return originalFetch(new Request(rewriteUrl(input.url),input),init);}return originalFetch(input,init);};const originalOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,async,username,password){return originalOpen.call(this,method,rewriteUrl(url),async,username,password);};})();</script>`;
  return html.includes(marker) ? html.replace(marker, `${rewriteScript}</head>`) : `${html}${rewriteScript}`;
}

function getRemoteAddress(req: { socket?: { remoteAddress?: string | undefined } }): string {
  return req.socket?.remoteAddress ?? 'unknown';
}

function setTrustedProxyIdentityHeaders(headers: {
  setHeader(name: string, value: string): void;
  getHeader?(name: string): string | string[] | number | undefined;
}, req: { headers?: Record<string, string | string[] | undefined> }) {
  const forwardedProtoHeader = req.headers?.['x-forwarded-proto'];
  const forwardedHostHeader = req.headers?.['x-forwarded-host'];
  const hostHeader = req.headers?.host;

  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader ?? 'http';
  const forwardedHost = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : forwardedHostHeader ?? (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader ?? '127.0.0.1:3001');

  headers.setHeader('x-forwarded-user', OPENCLAW_TRUSTED_PROXY_USER);
  headers.setHeader('x-forwarded-proto', forwardedProto);
  headers.setHeader('x-forwarded-host', forwardedHost);
}

function stripFrameProtectionHeaders(proxyRes: { headers: Record<string, string | string[] | undefined> }) {
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['X-Frame-Options'];

  const cspHeader = proxyRes.headers['content-security-policy'];
  if (!cspHeader) {
    return;
  }

  if (Array.isArray(cspHeader)) {
    proxyRes.headers['content-security-policy'] = cspHeader.map((value) =>
      value.replace(/frame-ancestors\s+[^;]+;?/gi, ''),
    );
    return;
  }

  proxyRes.headers['content-security-policy'] = cspHeader.replace(/frame-ancestors\s+[^;]+;?/gi, '');
}

function rewriteProxyPrefix(requestUrl: string | undefined, prefix: string): string {
  const rewrittenUrl = (requestUrl ?? '').replace(new RegExp(`^${prefix}`), '');
  return rewrittenUrl.length > 0 ? rewrittenUrl : '/';
}

function prependBasePath(requestUrl: string | undefined, basePath: string): string {
  const normalizedUrl = requestUrl && requestUrl.length > 0 ? requestUrl : '/';
  return `${basePath}${normalizedUrl.startsWith('/') ? normalizedUrl : `/${normalizedUrl}`}`;
}

function closeSocketSet(socketSet: Set<Socket>, gracefulDelayMs: number) {
  for (const socket of socketSet) {
    socket.end();
    socket.setTimeout(gracefulDelayMs, () => {
      socket.destroy();
    });
  }
}

// Middleware
app.use(cors());

// Serve static frontend files FIRST - no authentication needed to load the UI
const frontendPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));
app.use('/clawos', express.static(frontendPath, { redirect: false }));

// Auth verification endpoint (no authentication needed for login)
app.post('/api/system/auth/verify', express.json(), (req, res) => {
  if (!CLAWOS_PASSWORD) {
    return res.json({ success: true, message: 'No password required' });
  }

  const { password } = req.body;
  if (password === CLAWOS_PASSWORD) {
    if (FILEBROWSER_COOKIE_SECRET) {
      res.setHeader('Set-Cookie', buildFileBrowserAuthCookie(req));
      res.append('Set-Cookie', buildMediaAuthCookie(req));
    } else {
      res.setHeader('Set-Cookie', buildMediaAuthCookie(req));
    }
    res.json({ success: true, message: 'Authentication successful' });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// --- Proxy for OpenClaw (NO authentication required - OpenClaw has its own token auth) ---
// Must be before authMiddleware so iframe can load without Basic Auth header
const openclawProxy = createProxyMiddleware({
  target: OPENCLAW_TARGET,
  changeOrigin: true,
  xfwd: true,
  ws: false,
  selfHandleResponse: true,
  pathRewrite: (requestPath) => rewriteProxyPrefix(rewriteProxyPrefix(requestPath, '/clawos/proxy/openclaw'), '/proxy/openclaw'),
  on: {
    proxyReq: (proxyReq, req) => {
      setTrustedProxyIdentityHeaders(proxyReq, req);
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, _req, res) => {
      stripFrameProtectionHeaders(proxyRes as { headers: Record<string, string | string[] | undefined> });

      res.removeHeader('x-frame-options');
      res.removeHeader('X-Frame-Options');
      res.setHeader(
        'content-security-policy',
        "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self' 'unsafe-inline' 'sha256-RxCZFmTWY/yQmhYxMDn+blaCuwLzOsV/XsVb0n5EkRU='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:",
      );

      const contentType = String(proxyRes.headers['content-type'] ?? '');
      if (!contentType.includes('text/html')) {
        return responseBuffer;
      }

      return responseBuffer;
    })
  }
});

app.use('/proxy/openclaw', openclawProxy);
app.use('/clawos/proxy/openclaw', openclawProxy);

// Catch-all to serve index.html for unknown routes (React Router support)
// This must be BEFORE authMiddleware so the login page can load
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/proxy')) {
    return next(); // Let the 404 fallback handle it
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use('/clawos', (req, res, next) => {
  if (req.originalUrl.startsWith('/clawos/api') || req.originalUrl.startsWith('/clawos/proxy')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Authentication middleware - protects API routes and other proxies only
app.use(authMiddleware);

app.use((req, res, next) => {
  if (req.originalUrl === '/clawos') {
    res.redirect('/clawos/');
    return;
  }
  next();
});

// --- Proxy for FileBrowser ---
const filebrowserProxy = createProxyMiddleware({
  target: FILEBROWSER_TARGET,
  changeOrigin: true,
  ws: false,
  selfHandleResponse: true,
  pathRewrite: (path) => prependBasePath(path, FILEBROWSER_BASE_PATH),
  on: {
    proxyReq: (proxyReq, req) => {
      logger.info(
        `FileBrowser HTTP proxying ${req.url ?? '/'} from ${getRemoteAddress(req)} to ${proxyReq.path}`,
        { module: 'Proxy' },
      );
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes) => {
      stripFrameProtectionHeaders(proxyRes as { headers: Record<string, string | string[] | undefined> });

      const contentType = String(proxyRes.headers['content-type'] ?? '');
      if (!contentType.includes('text/html')) {
        return responseBuffer;
      }

      const html = responseBuffer.toString('utf8');
      if (html.includes(FILEBROWSER_INLINE_STYLE)) {
        return html;
      }

      return html.replace('</head>', `${FILEBROWSER_INLINE_STYLE}</head>`);
    })
  }
});

app.use('/clawos/proxy/filebrowser', filebrowserProxy);
app.use('/proxy/filebrowser', filebrowserProxy);

const quarkAuthProxy = createProxyMiddleware({
  target: QUARK_AUTH_TARGET,
  changeOrigin: true,
  ws: false,
  secure: true,
  selfHandleResponse: true,
  pathRewrite: {
    '^/proxy/quark-auth': '',
    '^/clawos/proxy/quark-auth': ''
  },
  on: {
    proxyReq: (proxyReq) => {
      const session = getCachedQuarkAuthSession();
      if (session?.cookieHeader) {
        proxyReq.setHeader('Cookie', session.cookieHeader);
      }
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
      proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8');
      proxyReq.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
      proxyReq.setHeader('Sec-Fetch-Site', 'same-origin');
      proxyReq.setHeader('Sec-Fetch-Mode', 'navigate');
      proxyReq.setHeader('Sec-Fetch-Dest', 'iframe');
      proxyReq.setHeader('Origin', QUARK_AUTH_TARGET);
      proxyReq.setHeader('Referer', `${QUARK_AUTH_TARGET}/`);
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req) => {
      stripFrameProtectionHeaders(proxyRes as { headers: Record<string, string | string[] | undefined> });

      const setCookieHeader = proxyRes.headers['set-cookie'];
      if (Array.isArray(setCookieHeader) && setCookieHeader.length > 0) {
        await updateQuarkAuthSession(setCookieHeader);
      }

      delete proxyRes.headers['x-frame-options'];
      const contentType = String(proxyRes.headers['content-type'] ?? '');
      if (!contentType.includes('text/html')) {
        return responseBuffer;
      }

      return injectQuarkRequestRewrite(responseBuffer.toString('utf8'), req.url ?? '/proxy/quark-auth/');
    })
  }
});

const quarkUopProxy = createProxyMiddleware({
  target: QUARK_UOP_TARGET,
  changeOrigin: true,
  ws: false,
  secure: true,
  pathRewrite: {
    '^/proxy/quark-auth-uop': '',
    '^/clawos/proxy/quark-auth-uop': ''
  },
  on: {
    proxyReq: (proxyReq) => {
      const session = getCachedQuarkAuthSession();
      if (session?.cookieHeader) {
        proxyReq.setHeader('Cookie', session.cookieHeader);
      }
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
      proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
      proxyReq.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
      proxyReq.setHeader('Origin', QUARK_AUTH_TARGET);
      proxyReq.setHeader('Referer', `${QUARK_AUTH_TARGET}/`);
    },
    proxyRes: async (proxyRes) => {
      stripFrameProtectionHeaders(proxyRes as { headers: Record<string, string | string[] | undefined> });

      const setCookieHeader = proxyRes.headers['set-cookie'];
      if (Array.isArray(setCookieHeader) && setCookieHeader.length > 0) {
        await updateQuarkAuthSession(setCookieHeader);
      }

      delete proxyRes.headers['x-frame-options'];
      proxyRes.headers['access-control-allow-origin'] = '*';
      proxyRes.headers['access-control-allow-credentials'] = 'true';
    }
  }
});

app.use('/proxy/quark-auth', quarkAuthProxy);
app.use('/clawos/proxy/quark-auth', quarkAuthProxy);
app.use('/proxy/quark-auth-uop', quarkUopProxy);
app.use('/clawos/proxy/quark-auth-uop', quarkUopProxy);

const openclawWebSocketProxy = httpProxy.createProxyServer({
  target: OPENCLAW_WS_TARGET,
  changeOrigin: true,
  xfwd: true,
  ws: true,
});

openclawWebSocketProxy.on('proxyReqWs', (proxyReq, req) => {
  setTrustedProxyIdentityHeaders(proxyReq, req);
  logger.info(
    `OpenClaw WebSocket proxying ${req.url ?? '/'} from ${getRemoteAddress(req)} to ${OPENCLAW_WS_TARGET}`,
    { module: 'Proxy' },
  );

  if (proxyReq.path) {
    logger.info(`OpenClaw WebSocket upstream path ${proxyReq.path}`, { module: 'Proxy' });
  }
});

openclawWebSocketProxy.on('error', (error, req, socket) => {
  const requestPath = req?.url ?? '/';
  logger.error(`OpenClaw WebSocket proxy error on ${requestPath}: ${error.message}`, { module: 'Proxy' });
  if (socket && 'destroy' in socket) {
    socket.destroy();
  }
});

app.use(express.json());

app.get('/api/system/openclaw/bootstrap', (_req, res) => {
  res.json({
    success: true,
    data: {
      token: OPENCLAW_GATEWAY_TOKEN,
    },
  });
});

app.get('/clawos/api/system/openclaw/bootstrap', (_req, res) => {
  res.json({
    success: true,
    data: {
      token: OPENCLAW_GATEWAY_TOKEN,
    },
  });
});

app.post('/api/system/netdisk/quark-auth/reset', async (_req, res) => {
  await clearQuarkAuthSession();
  res.json({ success: true });
});

app.post('/clawos/api/system/netdisk/quark-auth/reset', async (_req, res) => {
  await clearQuarkAuthSession();
  res.json({ success: true });
});

app.get('/api/system/netdisk/quark-auth/status', async (_req, res) => {
  const session = await readQuarkAuthSession();
  const cookieHeader = session?.cookieHeader || '';
  const hasSession = cookieHeader.length > 0;
  const loginDetected = /_m_h5_tk=|__uid=|sid=|kps=|sign=/.test(cookieHeader);

  res.json({
    success: true,
    data: {
      hasSession,
      loginDetected,
      updatedAt: session?.updatedAt || null,
      cookie: cookieHeader
    }
  });
});

app.get('/clawos/api/system/netdisk/quark-auth/status', async (_req, res) => {
  const session = await readQuarkAuthSession();
  const cookieHeader = session?.cookieHeader || '';
  const hasSession = cookieHeader.length > 0;
  const loginDetected = /_m_h5_tk=|__uid=|sid=|kps=|sign=/.test(cookieHeader);

  res.json({
    success: true,
    data: {
      hasSession,
      loginDetected,
      updatedAt: session?.updatedAt || null,
      cookie: cookieHeader
    }
  });
});

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, { module: 'HTTP' });
  next();
});

// API Routes (protected by authMiddleware)
app.use('/api/system', apiRoutes);
app.use('/clawos/api/system', apiRoutes);

// Error handling fallback for API
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.originalUrl}`, { module: 'HTTP' });
  res.status(404).json({ success: false, error: 'Not Found' });
});

// Start server - bind to 127.0.0.1 to prevent LAN access (only Tailscale Funnel and localhost can access)
const server = app.listen(Number(PORT), '127.0.0.1', () => {
  logger.info(`ClawOS Backend started on port ${PORT} (bound to 127.0.0.1)`, { module: 'Server' });
  logger.info(`Serving frontend from: ${frontendPath}`, { module: 'Server' });
});

const httpSockets = new Set<Socket>();
const upgradedSockets = new Set<Socket>();
let isShuttingDown = false;

server.on('connection', (socket) => {
  httpSockets.add(socket);
  socket.on('close', () => {
    httpSockets.delete(socket);
    upgradedSockets.delete(socket);
  });
});

// Handle WebSocket upgrades for proxies
server.on('upgrade', (req, socket, head) => {
  upgradedSockets.add(socket as Socket);
  if (req.url && req.url.startsWith('/proxy/openclaw')) {
    const originalUrl = req.url;
    req.url = rewriteProxyPrefix(req.url, '/proxy/openclaw');
    logger.info(
      `Accepted WebSocket upgrade ${originalUrl} -> ${req.url} from ${getRemoteAddress(req)}`,
      { module: 'Proxy' },
    );
    openclawWebSocketProxy.ws(req, socket as any, head);
  } else if (req.url && req.url.startsWith('/clawos/proxy/openclaw')) {
    const originalUrl = req.url;
    req.url = rewriteProxyPrefix(req.url, '/clawos/proxy/openclaw');
    logger.info(
      `Accepted ClawOS OpenClaw WebSocket upgrade ${originalUrl} -> ${req.url} from ${getRemoteAddress(req)}`,
      { module: 'Proxy' },
    );
    openclawWebSocketProxy.ws(req, socket as any, head);
  } else {
    logger.warn(`Rejected WebSocket upgrade for ${req.url ?? 'unknown path'} from ${getRemoteAddress(req)}`, {
      module: 'Proxy'
    });
    socket.destroy();
  }
});

function shutdownServer(signal: string) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.warn(`Received ${signal}, shutting down ClawOS backend`, { module: 'Server' });

  openclawWebSocketProxy.close();
  server.close((error) => {
    if (error) {
      logger.error(`Graceful shutdown failed: ${error.message}`, { module: 'Server' });
      process.exit(1);
      return;
    }

    logger.info('ClawOS backend stopped cleanly', { module: 'Server' });
    process.exit(0);
  });

  closeSocketSet(httpSockets, 1500);
  closeSocketSet(upgradedSockets, 1500);

  setTimeout(() => {
    logger.error('Forced shutdown after timeout while waiting for sockets to close', { module: 'Server' });
    for (const socket of upgradedSockets) {
      socket.destroy();
    }
    for (const socket of httpSockets) {
      socket.destroy();
    }
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => {
  shutdownServer('SIGTERM');
});

process.on('SIGINT', () => {
  shutdownServer('SIGINT');
});

server.on('error', (e: NodeJS.ErrnoException) => {
  console.error('Server failed to start', e);
  logger.error(`Server error: ${e.message}`, { module: 'Server' });

  if (e.code === 'EADDRINUSE') {
    logger.error('Port 3001 is still occupied, exiting so systemd can retry cleanly', { module: 'Server' });
    process.exit(1);
  }
});
