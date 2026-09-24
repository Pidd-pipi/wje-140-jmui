import { Injectable } from '@nestjs/common';
import { VehicleStatus, DriverStatus } from '../types/enums';
import { BatchDispatchItem, BatchDispatchFailure } from '../types/interfaces';
import { isTimeOverlap, parseTime } from '../utils/timeOverlap';
import { VehicleService } from './vehicle.service';
import { DriverService } from './driver.service';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DispatchBatchValidator {
  constructor(
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
  ) {}

  private isValidOn(dateStr: string, at: Date): boolean {
    if (!DATE_ONLY.test(dateStr)) { return false; }
    const endOfDay = new Date(`${dateStr}T23:59:59.999`);
    return endOfDay.getTime() >= at.getTime();
  }

  private validateItemShape(item: any, index: number): string[] {
    const reasons: string[] = [];
    const requiredStrings = ['origin', 'destination', 'planDepartAt', 'planArriveAt', 'cargo'];
    for (const field of requiredStrings) {
      if (typeof item?.[field] !== 'string' || item[field].trim() === '') {
        reasons.push(`第${index + 1}笔缺少必填字段或格式非法: ${field}`);
      }
    }
    const requiredNumbers = ['vehicleId', 'driverId', 'weight', 'volume', 'freight', 'estimatedFuelCost', 'estimatedTollCost'];
    for (const field of requiredNumbers) {
      if (typeof item?.[field] !== 'number' || Number.isNaN(item[field])) {
        reasons.push(`第${index + 1}笔缺少必填字段或格式非法: ${field}`);
      }
    }
    if (reasons.length === 0) {
      try {
        if (parseTime(item.planDepartAt) >= parseTime(item.planArriveAt)) {
          reasons.push(`第${index + 1}笔预计出发时间必须早于预计到达时间`);
        }
      } catch {
        reasons.push(`第${index + 1}笔计划时间格式非法（支持 YYYY-MM-DD HH:mm 或 ISO 格式）`);
      }
    }
    return reasons;
  }

  // 仅校验，不落库不改状态；任一笔不合格即整批拒绝
  validate(items: BatchDispatchItem[], activeOrders: any[]): BatchDispatchFailure[] {
    const failures: BatchDispatchFailure[] = [];

    items.forEach((item, index) => {
      const reasons: string[] = this.validateItemShape(item, index);
      if (reasons.length > 0) {
        failures.push({ index, vehicleId: item?.vehicleId, driverId: item?.driverId, reasons });
        return;
      }

      // 车险、年检、驾照须覆盖计划出发时点
      const departDate = new Date(item.planDepartAt.includes('T') ? item.planDepartAt : item.planDepartAt.replace(' ', 'T'));

      const vehicle: any = this.vehicleService.findRaw(item.vehicleId);
      if (!vehicle) {
        reasons.push(`车辆不存在（vehicleId=${item.vehicleId}）`);
      } else {
        if (vehicle.status !== VehicleStatus.Available) {
          reasons.push(`车辆 ${vehicle.plateNo} 当前状态为 ${vehicle.status}，非空闲不可派单`);
        }
        if (!this.isValidOn(vehicle.insuranceExpireDate, departDate)) {
          reasons.push(`车辆 ${vehicle.plateNo} 车险将于 ${vehicle.insuranceExpireDate} 到期，无法覆盖计划出发时间 ${item.planDepartAt}`);
        }
        if (!this.isValidOn(vehicle.inspectionExpireDate, departDate)) {
          reasons.push(`车辆 ${vehicle.plateNo} 年检将于 ${vehicle.inspectionExpireDate} 到期，无法覆盖计划出发时间 ${item.planDepartAt}`);
        }
      }

      const driver: any = this.driverService.findRaw(item.driverId);
      if (!driver) {
        reasons.push(`司机不存在（driverId=${item.driverId}）`);
      } else {
        if (driver.status !== DriverStatus.Available) {
          reasons.push(`司机 ${driver.name} 当前状态为 ${driver.status}，非空闲不可派单`);
        }
        if (!this.isValidOn(driver.licenseExpireDate, departDate)) {
          reasons.push(`司机 ${driver.name} 驾照将于 ${driver.licenseExpireDate} 到期，无法覆盖计划出发时间 ${item.planDepartAt}`);
        }
      }

      for (const order of activeOrders) {
        if (isTimeOverlap(item.planDepartAt, item.planArriveAt, order.planDepartAt, order.planArriveAt)) {
          if (order.vehicleId === item.vehicleId) {
            reasons.push(`车辆在重叠时段已被调度单 ${order.orderNo} 占用（${order.planDepartAt} ~ ${order.planArriveAt}）`);
          }
          if (order.driverId === item.driverId) {
            reasons.push(`司机在重叠时段已被调度单 ${order.orderNo} 占用（${order.planDepartAt} ~ ${order.planArriveAt}）`);
          }
        }
      }

      if (reasons.length > 0) {
        failures.push({ index, vehicleId: item.vehicleId, driverId: item.driverId, reasons });
      }
    });

    // 批次内部互斥：同车或同司机在重叠时段重复安排
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (typeof a?.planDepartAt !== 'string' || typeof b?.planDepartAt !== 'string') { continue; }
        let overlap = false;
        try {
          overlap = isTimeOverlap(a.planDepartAt, a.planArriveAt, b.planDepartAt, b.planArriveAt);
        } catch {
          continue;
        }
        if (!overlap) { continue; }
        if (a.vehicleId === b.vehicleId) {
          this.appendReason(failures, j, b, `与本批次第${i + 1}笔在重叠时段重复使用同一车辆`);
        }
        if (a.driverId === b.driverId) {
          this.appendReason(failures, j, b, `与本批次第${i + 1}笔在重叠时段重复使用同一司机`);
        }
      }
    }

    return failures;
  }

  private appendReason(failures: BatchDispatchFailure[], index: number, item: BatchDispatchItem, reason: string) {
    const existing = failures.find((f) => f.index === index);
    if (existing) {
      existing.reasons.push(reason);
    } else {
      failures.push({ index, vehicleId: item.vehicleId, driverId: item.driverId, reasons: [reason] });
    }
  }
}
