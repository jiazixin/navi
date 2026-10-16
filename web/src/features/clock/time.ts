const weekdaysEn = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const weekdaysCn = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

export const pad2 = (value: number): string => String(value).padStart(2, '0');

export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export function greeting(hour: number): string {
  if (hour < 5) return '夜深了，早些休息。';
  if (hour < 11) return '早上好，今天从哪里出发？';
  if (hour < 13) return '中午好，稍作停留。';
  if (hour < 18) return '下午好，继续前行。';
  return '晚上好，慢慢来。';
}

export function describeDate(date: Date): { latin: string; chinese: string } {
  return {
    latin: `${weekdaysEn[date.getDay()] ?? ''} · ${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`,
    chinese: `${weekdaysCn[date.getDay()] ?? ''} · 第 ${isoWeek(date)} 周`,
  };
}
