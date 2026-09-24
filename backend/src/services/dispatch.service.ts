import { Injectable } from '@nestjs/common';
import { DispatchStatus } from '../types/enums';
import { BatchDispatchItemInput } from '../types/interfaces';
import { generateOrderNo } from '../utils/orderNumber';
import { calculateProfit } from '../utils/costCalculator';

@Injectable()
export class DispatchService {
  private rows = [{ id: 1, orderNo: 'DSP-20260612-0001', vehicleId: 1, driverId: 1, origin: '上海青浦仓', destination: '杭州萧山仓', planDepartAt: '2026-06-12 09:00', planArriveAt: '2026-06-12 13:30', cargo: '冷链食品', weight: 8200, volume: 42, freight: 7200, estimatedFuelCost: 1500, estimatedTollCost: 420, estimatedLaborCost: 1100, status: 'Assigned', profit: 4180, batchId: null as string | null }];
  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }
  create(payload: any) { const row = { ...payload, id: this.rows.length + 1 }; this.rows.push(row); return row; }

  orderNoExists(orderNo: string) {
    return this.rows.some((item: any) => item.orderNo === orderNo);
  }

  /** 同批次幂等：按 batchId 找回已派单 */
  findByBatchId(batchId: string) {
    return this.rows.filter((item: any) => item.batchId === batchId);
  }

  /** 仍占用车辆/司机的调度单（已派或在途；草稿和已取消/已完成不再占用） */
  findOccupying() {
    return this.rows.filter(
      (item: any) => item.status === DispatchStatus.Assigned || item.status === DispatchStatus.InProgress,
    );
  }

  /** 校验通过后落库：生成不重复单号、写为已派、计算利润 */
  createAssigned(item: BatchDispatchItemInput, batchId: string | null, now: Date = new Date()) {
    const laborCost = item.estimatedLaborCost ?? 0;
    const row = {
      id: this.rows.length + 1,
      orderNo: generateOrderNo('DSP', (orderNo) => this.orderNoExists(orderNo), now),
      vehicleId: item.vehicleId,
      driverId: item.driverId,
      origin: item.origin,
      destination: item.destination,
      planDepartAt: item.planDepartAt,
      planArriveAt: item.planArriveAt,
      actualDepartAt: null as string | null,
      actualArriveAt: null as string | null,
      cargo: item.cargo,
      weight: item.weight,
      volume: item.volume,
      freight: item.freight,
      estimatedFuelCost: item.estimatedFuelCost,
      estimatedTollCost: item.estimatedTollCost,
      estimatedLaborCost: laborCost,
      status: DispatchStatus.Assigned,
      profit: calculateProfit(item.freight, item.estimatedFuelCost, item.estimatedTollCost, laborCost),
      batchId,
    };
    this.rows.push(row);
    return row;
  }
}
