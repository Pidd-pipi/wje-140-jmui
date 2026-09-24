const sequenceByDay = new Map<string, number>();

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 生成单号：前缀-日期-当日4位序号；exists 用于对已落库单号做去重兜底，
 * 撞号时自动顺延序号，保证同一数据源内不重复。
 */
export function generateOrderNo(prefix = 'DSP', exists?: (orderNo: string) => boolean, now: Date = new Date()) {
  const key = `${prefix}-${dayKey(now)}`;
  let seq = sequenceByDay.get(key) ?? 0;
  let orderNo: string;
  do {
    seq += 1;
    orderNo = `${key}-${String(seq).padStart(4, '0')}`;
  } while (exists?.(orderNo));
  sequenceByDay.set(key, seq);
  return orderNo;
}
