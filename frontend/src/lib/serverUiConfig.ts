import { withBasePath } from './basePath'

export interface ServerUiConfig {
  dockSize: number
  autoHideDock: boolean
  defaultFullscreen: boolean
  wallpaper: string
  showWidgets: boolean
  dockHideDelay: number
  stickyNotifications: boolean
  musicQuality: string
  quickNote: string
}

export async function fetchServerUiConfig(): Promise<ServerUiConfig> {
  const response = await fetch(withBasePath('/api/system/config/ui'))
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || '加载服务器界面配置失败')
  }
  return json.data as ServerUiConfig
}

export async function saveServerUiConfig(nextUi: Partial<ServerUiConfig>): Promise<ServerUiConfig> {
  const response = await fetch(withBasePath('/api/system/config/ui'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextUi)
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || '保存服务器界面配置失败')
  }
  return json.data as ServerUiConfig
}
