export type Role = 'Admin' | 'FleetManager' | 'Dispatcher' | 'Driver' | 'Mechanic';
export interface AuthUser { id: number; role: Role; name: string; }
export interface ApiResult<T> { data: T; message: string; }

export interface BatchDispatchItem {
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

export interface BatchDispatchRequest {
  batchId: string;
  items: BatchDispatchItem[];
}

export interface BatchDispatchFailure {
  index: number;
  vehicleId: number;
  driverId: number;
  reasons: string[];
}

export interface BatchDispatchResult {
  batchId: string;
  accepted: boolean;
  duplicate: boolean;
  orders: any[];
  failures: BatchDispatchFailure[];
}
