export function greeting(hour: number): string {
  if (hour < 5) return '夜深了，早些休息。'
  if (hour < 11) return '早上好，今天从哪里出发？'
  if (hour < 13) return '中午好，稍作停留。'
  if (hour < 18) return '下午好，继续前行。'
  return '晚上好，慢慢来。'
}
