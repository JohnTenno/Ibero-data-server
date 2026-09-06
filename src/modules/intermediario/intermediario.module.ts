import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatasetsModule } from '../datasets/datasets.module.js';
import { IntermediarioService } from './intermediario.service.js';
import { IntermediarioController } from './intermediario.controller.js';

@Module({
  imports: [AuthModule, DatasetsModule],
  controllers: [IntermediarioController],
  providers: [IntermediarioService],
})
export class IntermediarioModule {}
