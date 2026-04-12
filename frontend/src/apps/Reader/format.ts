export function formatReaderDate(date: string) {
  try {
    return new Date(date).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return date
  }
}

export function importanceStars(importance: number) {
  return '★'.repeat(Math.max(1, Math.min(5, importance)))
}

export function looksLikeEnglishText(text: string) {
  if (!text.trim()) {
    return false
  }

  const latinMatches = text.match(/[A-Za-z]/g)?.length || 0
  const chineseMatches = text.match(/[\u4e00-\u9fa5]/g)?.length || 0
  return latinMatches > 12 && latinMatches > chineseMatches * 2
}
