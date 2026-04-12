const SETTINGS_PREFIX = 'openclaw.control.settings.v1:'
const SETTINGS_FALLBACK_KEY = 'openclaw.control.settings.v1'
const TOKEN_PREFIX = 'openclaw.control.token.v1:'
const TOKEN_FALLBACK_KEY = 'openclaw.control.token.v1'

export function normalizeGatewayUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) {
    return 'default'
  }

  try {
    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname || '/'}`
    const parsedUrl = new URL(trimmedUrl, baseUrl)
    const normalizedPath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/+$/, '') || parsedUrl.pathname
    return `${parsedUrl.protocol}//${parsedUrl.host}${normalizedPath}`
  } catch {
    return trimmedUrl
  }
}

function findFirstMatchingValue(storage: Storage, prefix: string, fallbackKey: string): string | null {
  const exactValue = storage.getItem(fallbackKey)
  if (exactValue) {
    return exactValue
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && key.startsWith(prefix)) {
      const value = storage.getItem(key)
      if (value) {
        return value
      }
    }
  }

  return null
}

export function buildEmbeddedOpenClawIframeUrl(gatewayUrl: string, token: string | null): string {
  const baseIframeUrl = `${window.location.pathname.startsWith('/clawos') ? '/clawos' : ''}/proxy/openclaw/`
  const gatewayQuery = `?gatewayUrl=${encodeURIComponent(normalizeGatewayUrl(gatewayUrl))}`
  const tokenFragment = token ? `#token=${encodeURIComponent(token)}` : ''
  return `${baseIframeUrl}${gatewayQuery}${tokenFragment}`
}

export async function fetchBootstrapToken(): Promise<string | null> {
  const bootstrapPaths = ['/api/system/openclaw/bootstrap', '/clawos/api/system/openclaw/bootstrap']

  for (const bootstrapPath of bootstrapPaths) {
    try {
      const response = await fetch(bootstrapPath)
      if (!response.ok) {
        continue
      }

      const payload = await response.json() as { success?: boolean; data?: { token?: string } }
      const token = payload.data?.token?.trim()
      if (payload.success && token) {
        return token
      }
    } catch {
      // ignore and try the next same-origin bootstrap endpoint
    }
  }

  return null
}

export async function primeEmbeddedOpenClawStorage(gatewayUrl: string): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }

  const normalizedGatewayUrl = normalizeGatewayUrl(gatewayUrl)
  const targetSettingsKey = `${SETTINGS_PREFIX}${normalizedGatewayUrl}`
  const targetTokenKey = `${TOKEN_PREFIX}${normalizedGatewayUrl}`
  let resolvedToken: string | null = null

  try {
    const localStorageValue = window.localStorage.getItem(targetSettingsKey)
    const seedSettingsRaw = localStorageValue ?? findFirstMatchingValue(window.localStorage, SETTINGS_PREFIX, SETTINGS_FALLBACK_KEY)
    const parsedSettings = seedSettingsRaw ? JSON.parse(seedSettingsRaw) as Record<string, unknown> : {}
    const nextSettings = {
      ...parsedSettings,
      gatewayUrl: normalizedGatewayUrl,
    }
    window.localStorage.setItem(targetSettingsKey, JSON.stringify(nextSettings))
  } catch {
    // ignore storage priming failures so the app can still render
  }

  try {
    if (window.sessionStorage.getItem(targetTokenKey)) {
      return window.sessionStorage.getItem(targetTokenKey)
    }

    const bootstrapToken = await fetchBootstrapToken()
    const tokenValue = bootstrapToken ?? findFirstMatchingValue(window.sessionStorage, TOKEN_PREFIX, TOKEN_FALLBACK_KEY)
    if (tokenValue) {
      window.sessionStorage.setItem(TOKEN_FALLBACK_KEY, tokenValue)
      window.sessionStorage.setItem(targetTokenKey, tokenValue)
      resolvedToken = tokenValue
    }
  } catch {
    // ignore storage priming failures so the app can still render
  }

  return resolvedToken ?? window.sessionStorage.getItem(targetTokenKey)
}
