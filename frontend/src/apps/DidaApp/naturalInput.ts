interface ParsedNaturalTask {
  title: string;
  dueDate?: string;
  isAllDay: boolean;
  reminder?: string;
}

const DATE_REGEX = /大后天|后天|明天|今天|今晚|下周[一二三四五六日天]/g;
const PERIOD_REGEX = /凌晨|早上|上午|中午|下午|晚上/g;
const TIME_COLON_REGEX = /\d{1,2}[:：]\d{1,2}/g;
const TIME_DOT_REGEX = /\d{1,2}点(半|一刻|三刻|\d{1,2}分?)?/g;

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function parseDayOffset(text: string): number | null {
  if (text.includes('大后天')) return 3;
  if (text.includes('后天')) return 2;
  if (text.includes('明天')) return 1;
  if (text.includes('今天') || text.includes('今晚')) return 0;
  return null;
}

function parseNextWeekday(text: string, now: Date): Date | null {
  const match = text.match(/下周([一二三四五六日天])/);
  if (!match) return null;

  const weekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
  };

  const targetWeekday = weekdayMap[match[1]];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  const currentWeekday = base.getDay();
  const toNextMonday = ((8 - currentWeekday) % 7) || 7;
  base.setDate(base.getDate() + toNextMonday);

  const mondayBased = targetWeekday === 0 ? 6 : targetWeekday - 1;
  base.setDate(base.getDate() + mondayBased);

  return base;
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const colonMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})[:：](\d{1,2})/);
  if (colonMatch) {
    const period = colonMatch[1] || (text.includes('今晚') ? '晚上' : '');
    let hour = Number(colonMatch[2]);
    const minute = Number(colonMatch[3]);

    if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    if (period === '凌晨' && hour === 12) hour = 0;

    return { hour, minute };
  }

  const dotMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})点(半|一刻|三刻|(\d{1,2})分?)?/);
  if (!dotMatch) return null;

  const period = dotMatch[1] || (text.includes('今晚') ? '晚上' : '');
  let hour = Number(dotMatch[2]);
  let minute = 0;
  const tail = dotMatch[3] || '';

  if (tail === '半') minute = 30;
  else if (tail === '一刻') minute = 15;
  else if (tail === '三刻') minute = 45;
  else if (dotMatch[4]) minute = Number(dotMatch[4]);

  if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
  if (period === '中午' && hour < 11) hour += 12;
  if (period === '凌晨' && hour === 12) hour = 0;

  return { hour, minute };
}

function cleanupTitle(rawInput: string): string {
  const text = rawInput
    .replace(DATE_REGEX, ' ')
    .replace(PERIOD_REGEX, ' ')
    .replace(TIME_COLON_REGEX, ' ')
    .replace(TIME_DOT_REGEX, ' ')
    .replace(/(^|\s)(去|要|在)(?=[\u4e00-\u9fa5])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || normalizeText(rawInput);
}

export function getNaturalTimeFragments(input: string): string[] {
  const text = normalizeText(input);
  if (!text) return [];

  const fragments = [
    ...(text.match(DATE_REGEX) || []),
    ...(text.match(PERIOD_REGEX) || []),
    ...(text.match(TIME_COLON_REGEX) || []),
    ...(text.match(TIME_DOT_REGEX) || []),
  ];

  return Array.from(new Set(fragments));
}

export function parseNaturalTaskInput(input: string, now: Date = new Date()): ParsedNaturalTask {
  const normalized = normalizeText(input);
  if (!normalized) {
    return { title: '', isAllDay: true };
  }

  const nextWeekdayDate = parseNextWeekday(normalized, now);
  const dayOffset = parseDayOffset(normalized);
  const time = parseTime(normalized);

  const dueBase = nextWeekdayDate
    ? new Date(nextWeekdayDate)
    : dayOffset !== null
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset)
      : null;

  let dueDate: string | undefined;
  let isAllDay = true;
  let reminder: string | undefined;

  if (dueBase) {
    if (time) {
      dueBase.setHours(time.hour, time.minute, 0, 0);
      isAllDay = false;
      reminder = '0';
    } else {
      dueBase.setHours(0, 0, 0, 0);
    }
    dueDate = dueBase.toISOString();
  }

  return {
    title: cleanupTitle(normalized),
    dueDate,
    isAllDay,
    reminder,
  };
}
