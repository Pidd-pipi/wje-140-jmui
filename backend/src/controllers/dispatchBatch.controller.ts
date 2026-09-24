import { Body, Controller, Post } from '@nestjs/common';
import { DispatchBatchService } from '../services/dispatchBatch.service';
import { BatchDispatchInput } from '../types/interfaces';

@Controller('dispatch-orders')
export class DispatchBatchController {
  constructor(private readonly batchService: DispatchBatchService) {}

  @Post('batch')
  dispatchBatch(@Body() payload: BatchDispatchInput) {
    return this.batchService.dispatchBatch(payload);
  }
}
