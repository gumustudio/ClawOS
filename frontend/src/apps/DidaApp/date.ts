export function normalizeDidaDateForJs(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

export function parseTaskDate(value?: string): Date | null {
  const normalized = normalizeDidaDateForJs(value);
  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function toDidaApiDate(value?: string): string | undefined {
  if (!value) return undefined;

  const normalizedOffset = value.replace(/([+-]\d{2}):(\d{2})$/, '$1$2');
  return normalizedOffset.replace(/\.\d{3}Z$/, '.000+0000');
}
