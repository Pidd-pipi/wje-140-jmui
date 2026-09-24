import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DispatchService } from '../services/dispatch.service';
import { BatchDispatchRequest } from '../types/interfaces';
@Controller('dispatch-orders')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(Number(id)); }
  @Post() create(@Body() payload: any) { return this.service.create(payload); }
  @Post('batch') createBatch(@Body() payload: BatchDispatchRequest) { return this.service.createBatch(payload); }
}
