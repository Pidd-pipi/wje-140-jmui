import { BadRequestException, Injectable } from '@nestjs/common';
import { DispatchStatus, DriverStatus, VehicleStatus } from '../types/enums';
import { BatchDispatchItem, BatchDispatchRequest, BatchDispatchResult } from '../types/interfaces';
import { generateOrderNo } from '../utils/orderNumber';
import { calculateLaborCost, calculateProfit } from '../utils/costCalculator';
import { VehicleService } from './vehicle.service';
import { DriverService } from './driver.service';
import { DispatchBatchValidator } from './dispatchBatchValidator.service';

@Injectable()
export class DispatchService {
  private rows = [{ id: 1, orderNo: 'DSP-20260612-0001', vehicleId: 1, driverId: 1, origin: '上海青浦仓', destination: '杭州萧山仓', planDepartAt: '2026-06-12 09:00', planArriveAt: '2026-06-12 13:30', cargo: '冷链食品', weight: 8200, volume: 42, freight: 7200, estimatedFuelCost: 1500, estimatedTollCost: 420, status: 'Assigned', profit: 4180 }];
  private orderSeq = 1;
  private readonly processedBatches = new Map<string, { result: BatchDispatchResult; fingerprint: string }>();

  constructor(
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly batchValidator: DispatchBatchValidator,
  ) {}

  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }
  create(payload: any) { const row = { ...payload, id: this.rows.length + 1 }; this.rows.push(row); return row; }

  private activeOrders() {
    return this.rows.filter((item: any) => item.status === DispatchStatus.Assigned || item.status === DispatchStatus.InProgress);
  }

  private nextOrderNo() {
    this.orderSeq += 1;
    return generateOrderNo('DSP', this.orderSeq);
  }

  private fingerprint(items: BatchDispatchItem[]) {
    return JSON.stringify(items);
  }

  // 批量派单：先整批校验，全部通过才落单；任一笔不合格则整批拒绝，调度与资源状态不变
  createBatch(payload: BatchDispatchRequest): BatchDispatchResult {
    const batchId = typeof payload?.batchId === 'string' && payload.batchId.trim() !== '' ? payload.batchId.trim() : '';
    if (!batchId) {
      throw new BadRequestException({ message: '批量派单失败：缺少批次号 batchId', failures: [] });
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) {
      throw new BadRequestException({ message: '批量派单失败：items 不能为空', failures: [] });
    }

    // 幂等：同一批次号 + 相同内容重复提交，直接返回首次结果，不重复占用资源
    const cached = this.processedBatches.get(batchId);
    if (cached && cached.fingerprint === this.fingerprint(items)) {
      return { ...cached.result, duplicate: true };
    }

    const failures = this.batchValidator.validate(items, this.activeOrders());
    if (failures.length > 0) {
      throw new BadRequestException({
        message: `批量派单被拒绝：共 ${items.length} 笔，${failures.length} 笔校验未通过，整批未生效`,
        failures,
      });
    }

    // 统一生成不重复单号并计算利润，随后一次性提交
    const created = items.map((item: BatchDispatchItem, i: number) => {
      const driver: any = this.driverService.findRaw(item.driverId);
      const laborCost = typeof item.estimatedLaborCost === 'number'
        ? item.estimatedLaborCost
        : calculateLaborCost(driver.monthlySalary, item.planDepartAt, item.planArriveAt);
      return {
        ...item,
        id: this.rows.length + 1 + i,
        orderNo: this.nextOrderNo(),
        status: DispatchStatus.Assigned,
        laborCost,
        profit: calculateProfit(item.freight, item.estimatedFuelCost, item.estimatedTollCost, laborCost),
      };
    });
    this.rows.push(...created);
    for (const item of items) {
      this.vehicleService.updateStatus(item.vehicleId, VehicleStatus.OnTrip);
      this.driverService.updateStatus(item.driverId, DriverStatus.OnTrip);
    }

    const result: BatchDispatchResult = { batchId, accepted: true, duplicate: false, orders: created, failures: [] };
    this.processedBatches.set(batchId, { result, fingerprint: this.fingerprint(items) });
    return result;
  }
}
