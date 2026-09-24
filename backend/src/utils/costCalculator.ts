export function calculateProfit(freight: number, fuelCost: number, tollCost: number, laborCost: number) {
  return freight - fuelCost - tollCost - laborCost;
}
export function calculateTotalCost(...items: number[]) {
  return items.reduce((sum, item) => sum + item, 0);
}
// 人工成本：按司机月基本工资折算日薪 × 行程天数（不足 24 小时按 1 天计）
export function calculateLaborCost(monthlySalary: number, departAt: string, arriveAt: string) {
  const start = new Date(departAt.includes('T') ? departAt : departAt.replace(' ', 'T')).getTime();
  const end = new Date(arriveAt.includes('T') ? arriveAt : arriveAt.replace(' ', 'T')).getTime();
  const hours = Math.max(end - start, 0) / 36e5;
  const days = Math.max(1, Math.ceil(hours / 24));
  return Math.round(((monthlySalary / 30) * days) * 100) / 100;
}
