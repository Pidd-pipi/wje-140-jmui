import { Injectable } from '@nestjs/common';
import { VehicleStatus } from '../types/enums';

@Injectable()
export class VehicleService {
  private rows = [
    { id: 1, plateNo: '沪A-7821', vehicleType: 'Refrigerated', brandModel: '东风天锦 KR', purchaseDate: '2023-03-12', insuranceExpireDate: '2026-09-30', inspectionExpireDate: '2026-11-20', status: 'Available', mileage: 88210, tankCapacity: 380, dailyFixedCost: 260 },
    { id: 2, plateNo: '沪B-3309', vehicleType: 'HeavyTruck', brandModel: '解放 J7', purchaseDate: '2022-08-05', insuranceExpireDate: '2027-03-18', inspectionExpireDate: '2027-02-10', status: 'Available', mileage: 142300, tankCapacity: 600, dailyFixedCost: 320 },
  ];
  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }
  create(payload: any) { const row = { ...payload, id: this.rows.length + 1 }; this.rows.push(row); return row; }
  markOnTrip(id: number) {
    const row = this.findOne(id);
    if (row) { row.status = VehicleStatus.OnTrip; }
    return row;
  }
}
