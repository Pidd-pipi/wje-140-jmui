export function parseTime(value: string): number {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const time = new Date(normalized).getTime();
  if (Number.isNaN(time)) {
    throw new Error(`无法解析的时间格式: ${value}`);
  }
  return time;
}

// 半开区间 [start, end) 重叠判断：首尾相接不视为冲突
export function isTimeOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  const aStart = parseTime(firstStart);
  const aEnd = parseTime(firstEnd);
  const bStart = parseTime(secondStart);
  const bEnd = parseTime(secondEnd);
  return aStart < bEnd && bStart < aEnd;
}
