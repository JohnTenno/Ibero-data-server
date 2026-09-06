import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { DatasetsModule } from './modules/datasets/datasets.module.js';
import { AnalysesModule } from './modules/analyses/analyses.module.js';
import { IntermediarioModule } from './modules/intermediario/intermediario.module.js';
import { PublicModule } from './modules/public/public.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    DatasetsModule,
    AnalysesModule,
    IntermediarioModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
