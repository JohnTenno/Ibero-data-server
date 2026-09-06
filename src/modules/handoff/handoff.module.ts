import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HandoffService } from './handoff.service.js';
import { CkanCompatController } from './ckan-compat.controller.js';
import { DownloadTokenGuard } from './download-token.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [CkanCompatController],
  providers: [HandoffService, DownloadTokenGuard],
  exports: [HandoffService, DownloadTokenGuard],
})
export class HandoffModule {}
