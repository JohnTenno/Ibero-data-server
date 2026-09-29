import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { DatasetsModule } from '../datasets/datasets.module.js';
import { HandoffModule } from '../handoff/handoff.module.js';
import { AnalysesService } from './analyses.service.js';
import { AnalysesController } from './analyses.controller.js';
import { AnalysesDownloadController } from './analyses-download.controller.js';
import { AnalysesVizcanvasController } from './analyses-vizcanvas.controller.js';

@Module({
  imports: [AuthModule, AnalysisModule, DatasetsModule, HandoffModule],
  controllers: [AnalysesVizcanvasController, AnalysesController, AnalysesDownloadController],
  providers: [AnalysesService],
})
export class AnalysesModule {}
