export type NetdiskFileKind = 'folder' | 'image' | 'video' | 'audio' | 'document'

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'ape', 'alac'])

function getFileExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase()
  const dotIndex = normalizedName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === normalizedName.length - 1) {
    return ''
  }
  return normalizedName.slice(dotIndex + 1)
}

export function getNetdiskFileKind(file: { name: string; is_dir: boolean }): NetdiskFileKind {
  if (file.is_dir) {
    return 'folder'
  }

  const extension = getFileExtension(file.name)
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio'
  }
  return 'document'
}
