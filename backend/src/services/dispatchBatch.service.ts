import { BadRequestException, Injectable } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { DriverService } from './driver.service';
import { DispatchService } from './dispatch.service';
import { VehicleStatus, DriverStatus } from '../types/enums';
import { BatchDispatchInput, BatchDispatchItemInput, BatchDispatchRejection } from '../types/interfaces';

interface TimeWindow {
  start: Date;
  end: Date;
}

/** 调度占用（来自已派/在途单或本次批内已接受的任务） */
interface Occupancy extends TimeWindow {
  orderNo?: string;
  index?: number;
}

@Injectable()
export class DispatchBatchService {
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
  ) {}

  dispatchBatch(payload: BatchDispatchInput, now: Date = new Date()) {
    const items = payload?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException({ message: '批量派单至少需要一笔待派任务', rejections: [] });
    }

    // 幂等：同一 batchId 再次提交，直接返回首次结果，不重复占用资源
    const batchId = payload.batchId?.trim() || null;
    if (batchId) {
      const existed = this.dispatchService.findByBatchId(batchId);
      if (existed.length > 0) {
        return { idempotent: true, batchId, count: existed.length, orders: existed };
      }
    }

    // 以“车辆/司机”为键收集占用：既有已派/在途单 + 批内逐条通过的任务
    const vehicleBusy = new Map<number, Occupancy[]>();
    const driverBusy = new Map<number, Occupancy[]>();
    for (const order of this.dispatchService.findOccupying() as any[]) {
      this.pushOccupancy(vehicleBusy, order.vehicleId, this.toWindow(order.planDepartAt, order.planArriveAt), { orderNo: order.orderNo });
      this.pushOccupancy(driverBusy, order.driverId, this.toWindow(order.planDepartAt, order.planArriveAt), { orderNo: order.orderNo });
    }

    const rejections: BatchDispatchRejection[] = [];

    items.forEach((item, index) => {
      const reasons: string[] = [];
      const clientTaskId = item?.clientTaskId;

      const window = this.validateItem(item, reasons);
      const vehicle = item ? this.vehicleService.findOne(Number(item.vehicleId)) : undefined;
      const driver = item ? this.driverService.findOne(Number(item.driverId)) : undefined;

      if (!vehicle) {
        reasons.push(`车辆不存在：vehicleId=${item?.vehicleId}`);
      } else {
        if (vehicle.status !== VehicleStatus.Available) {
          reasons.push(`车辆 ${vehicle.plateNo} 当前状态为 ${vehicle.status}，非空闲`);
        }
        if (!this.isValidOn(vehicle.insuranceExpireDate, now)) {
          reasons.push(`车辆 ${vehicle.plateNo} 保险已过期或即将无效（到期日 ${vehicle.insuranceExpireDate}）`);
        }
        if (!this.isValidOn(vehicle.inspectionExpireDate, now)) {
          reasons.push(`车辆 ${vehicle.plateNo} 年检已过期或即将无效（到期日 ${vehicle.inspectionExpireDate}）`);
        }
      }

      if (!driver) {
        reasons.push(`司机不存在：driverId=${item?.driverId}`);
      } else {
        if (driver.status !== DriverStatus.Available) {
          reasons.push(`司机 ${driver.name} 当前状态为 ${driver.status}，非空闲`);
        }
        if (!this.isValidOn(driver.licenseExpireDate, now)) {
          reasons.push(`司机 ${driver.name} 驾照已过期或即将无效（到期日 ${driver.licenseExpireDate}）`);
        }
      }

      // 时段重叠：同车 / 同司机，既有单与批内任务都参与判定
      if (window && vehicle) {
        const hit = this.findOverlap(vehicleBusy.get(vehicle.id) ?? [], window);
        if (hit) {
          reasons.push(this.overlapReason(`车辆 ${vehicle.plateNo}`, hit, item.planDepartAt, item.planArriveAt));
        }
      }
      if (window && driver) {
        const hit = this.findOverlap(driverBusy.get(driver.id) ?? [], window);
        if (hit) {
          reasons.push(this.overlapReason(`司机 ${driver.name}`, hit, item.planDepartAt, item.planArriveAt));
        }
      }

      if (reasons.length > 0) {
        rejections.push({ index, clientTaskId, reasons });
        return;
      }

      // 该笔通过，登记为批内占用，供后续笔做冲突判定
      this.pushOccupancy(vehicleBusy, vehicle!.id, window!, { index });
      this.pushOccupancy(driverBusy, driver!.id, window!, { index });
    });

    // 一笔不合格整批拒绝：此前只在临时 Map 中登记，调度与资源状态均未改动
    if (rejections.length > 0) {
      throw new BadRequestException({
        message: `批量派单校验失败，整批已拒绝（${rejections.length}/${items.length} 笔不合格），调度与资源状态未变更`,
        rejections,
      });
    }

    // 全部通过后原子提交：生成单号、写为已派、车辆/司机置为运输中
    const orders: any[] = [];
    const occupiedVehicles = new Set<number>();
    const occupiedDrivers = new Set<number>();
    for (const item of items as BatchDispatchItemInput[]) {
      const order = this.dispatchService.createAssigned(item, batchId, now);
      orders.push(order);
      if (!occupiedVehicles.has(order.vehicleId)) {
        this.vehicleService.markOnTrip(order.vehicleId);
        occupiedVehicles.add(order.vehicleId);
      }
      if (!occupiedDrivers.has(order.driverId)) {
        this.driverService.markOnTrip(order.driverId);
        occupiedDrivers.add(order.driverId);
      }
    }

    return { idempotent: false, batchId, count: orders.length, orders };
  }

  private validateItem(item: BatchDispatchItemInput | undefined, reasons: string[]): TimeWindow | null {
    if (!item || typeof item !== 'object') {
      reasons.push('任务内容为空或格式不正确');
      return null;
    }
    for (const field of ['vehicleId', 'driverId', 'origin', 'destination', 'planDepartAt', 'planArriveAt', 'cargo'] as const) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        reasons.push(`字段 ${field} 不能为空`);
      }
    }
    for (const field of ['freight', 'estimatedFuelCost', 'estimatedTollCost'] as const) {
      if (typeof item[field] !== 'number' || Number.isNaN(item[field]) || item[field] < 0) {
        reasons.push(`字段 ${field} 必须为非负数字`);
      }
    }
    if (item.estimatedLaborCost !== undefined && (typeof item.estimatedLaborCost !== 'number' || item.estimatedLaborCost < 0)) {
      reasons.push('字段 estimatedLaborCost 必须为非负数字');
    }

    const depart = this.parseDate(item?.planDepartAt);
    const arrive = this.parseDate(item?.planArriveAt);
    if (!depart) {
      reasons.push('planDepartAt 时间格式无法解析');
    }
    if (!arrive) {
      reasons.push('planArriveAt 时间格式无法解析');
    }
    if (depart && arrive && arrive.getTime() <= depart.getTime()) {
      reasons.push('计划到达时间必须晚于计划出发时间');
      return null;
    }
    return depart && arrive ? { start: depart, end: arrive } : null;
  }

  /** 基准日当天仍有效：到期日 >= 当天零点 */
  private isValidOn(expireDate: string, now: Date) {
    const expire = this.parseDate(expireDate);
    if (!expire) { return false; }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deadline = new Date(expire.getFullYear(), expire.getMonth(), expire.getDate());
    return deadline.getTime() >= today.getTime();
  }

  private parseDate(value?: string): Date | null {
    if (!value) { return null; }
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toWindow(depart: string, arrive: string): TimeWindow {
    return { start: this.parseDate(depart)!, end: this.parseDate(arrive)! };
  }

  private pushOccupancy(map: Map<number, Occupancy[]>, key: number, window: TimeWindow, extra: Partial<Occupancy>) {
    const list = map.get(key) ?? [];
    list.push({ ...window, ...extra });
    map.set(key, list);
  }

  /** 重叠判定：已有开始时间 < 新到达时间 且 新开始时间 < 已有结束时间（首尾相接不算重叠） */
  private findOverlap(list: Occupancy[], window: TimeWindow): Occupancy | undefined {
    return list.find((o) => window.start.getTime() < o.end.getTime() && o.start.getTime() < window.end.getTime());
  }

  private overlapReason(target: string, hit: Occupancy, departAt: string, arriveAt: string) {
    const who = hit.orderNo ? `调度单 ${hit.orderNo}` : `批次内第 ${(hit.index ?? 0) + 1} 笔任务`;
    return `${target} 在 ${departAt}~${arriveAt} 与${who}时段重叠`;
  }
}
