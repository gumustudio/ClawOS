export interface MetadataBadge {
  label: string
  className: string
  title: string
}

interface BadgeSource {
  warmupFailed?: boolean
  warmupFailureReason?: string
  metadataSource?: 'embedded' | 'netease-cache' | 'netease-live' | 'mixed'
}

export const getMetadataBadge = (song: BadgeSource): MetadataBadge | null => {
  if (song.warmupFailed) {
    return { label: '补全失败', className: 'bg-amber-50 text-amber-700 border-amber-200', title: song.warmupFailureReason || '未能从网易云补全更多信息' }
  }

  switch (song.metadataSource) {
    case 'mixed':
      return { label: '混合信息', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', title: '部分信息来自本地文件，部分来自网易云补全' }
    case 'netease-live':
      return { label: '云端补全', className: 'bg-sky-50 text-sky-700 border-sky-200', title: '信息由网易云在线补全并已缓存到本地' }
    default:
      return null
  }
}
