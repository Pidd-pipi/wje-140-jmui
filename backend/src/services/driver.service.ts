import { Injectable } from '@nestjs/common';
import { DriverStatus } from '../types/enums';

@Injectable()
export class DriverService {
  private rows = [
    { id: 1, name: '赵强', phone: '13800000001', identityNo: '310101199001010011', licenseType: 'B2', licenseExpireDate: '2028-05-01', hireDate: '2022-01-10', status: 'Available', monthlySalary: 9800 },
    { id: 2, name: '孙磊', phone: '13800000002', identityNo: '310102198807070022', licenseType: 'A2', licenseExpireDate: '2029-11-22', hireDate: '2021-03-15', status: 'Available', monthlySalary: 10600 },
  ];
  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }
  create(payload: any) { const row = { ...payload, id: this.rows.length + 1 }; this.rows.push(row); return row; }
  markOnTrip(id: number) {
    const row = this.findOne(id);
    if (row) { row.status = DriverStatus.OnTrip; }
    return row;
  }
}
