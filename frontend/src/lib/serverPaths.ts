import { withBasePath } from './basePath'

export interface ServerPathsConfig {
  downloadsDir: string
  musicDownloadsDir: string
  localMusicDir: string
  notesDir: string
  readerDir: string
  stockAnalysisDir: string
  videoDownloadsDir: string
}

export async function fetchServerPaths(): Promise<ServerPathsConfig> {
  const response = await fetch(withBasePath('/api/system/config/paths'))
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || '加载服务器路径配置失败')
  }
  return json.data as ServerPathsConfig
}

export async function saveServerPaths(nextPaths: Partial<ServerPathsConfig>): Promise<ServerPathsConfig> {
  const response = await fetch(withBasePath('/api/system/config/paths'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextPaths)
  })
  const json = await response.json()
  if (!json.success) {
    throw new Error(json.error || '保存服务器路径配置失败')
  }
  return json.data as ServerPathsConfig
}
