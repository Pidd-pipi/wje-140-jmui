export type Role = 'Admin' | 'FleetManager' | 'Dispatcher' | 'Driver' | 'Mechanic';
export interface AuthUser { id: number; role: Role; name: string; }
export interface ApiResult<T> { data: T; message: string; }

/** 批量派单中的单笔待派任务（入参） */
export interface BatchDispatchItemInput {
  clientTaskId?: string;
  vehicleId: number;
  driverId: number;
  origin: string;
  destination: string;
  planDepartAt: string;
  planArriveAt: string;
  cargo: string;
  weight: number;
  volume: number;
  freight: number;
  estimatedFuelCost: number;
  estimatedTollCost: number;
  estimatedLaborCost?: number;
}

/** 批量派单请求 */
export interface BatchDispatchInput {
  batchId?: string;
  items: BatchDispatchItemInput[];
}

/** 单笔校验失败原因 */
export interface BatchDispatchRejection {
  index: number;
  clientTaskId?: string;
  reasons: string[];
}

