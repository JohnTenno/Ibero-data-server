import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { HandoffModule } from '../handoff/handoff.module.js';
import { PublicService } from './public.service.js';
import { PublicController } from './public.controller.js';

@Module({
  imports: [AnalysisModule, HandoffModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
