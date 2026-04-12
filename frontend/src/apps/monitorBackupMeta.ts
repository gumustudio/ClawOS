export type BackupObservationTone = 'ok' | 'warning' | 'missing-config' | 'missing-index'

export function getBackupObservationClassName(tone: BackupObservationTone) {
  switch (tone) {
    case 'ok':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'missing-config':
    case 'missing-index':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    default:
      return 'border-slate-200 bg-white/40 text-slate-500'
  }
}
