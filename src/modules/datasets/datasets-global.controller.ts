import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { DatasetsService } from './datasets.service.js';

@Controller('datasets')
@UseGuards(JwtAuthGuard)
export class DatasetsGlobalController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    return this.datasetsService.findAllGlobal(limit ? Number(limit) : undefined);
  }
}
