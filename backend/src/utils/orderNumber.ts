export function generateOrderNo(prefix = 'DSP', seq = 1, date: Date = new Date()) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${day}-${String(seq).padStart(4, '0')}`;
}
