import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { OrgRolesGuard } from '../../shared/guards/org-roles.guard.js';
import { OrgRoles } from '../../shared/decorators/org-roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface.js';
import { DatasetsService } from './datasets.service.js';
import { CreateDatasetDto } from './dto/create-dataset.dto.js';

@Controller('organizations/:organizationId/datasets')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Get()
  findAll(@Param('organizationId') organizationId: string) {
    return this.datasetsService.findAllByOrganization(organizationId);
  }

  @Get(':datasetId')
  findOne(@Param('organizationId') organizationId: string, @Param('datasetId') datasetId: string) {
    return this.datasetsService.findOne(organizationId, datasetId);
  }

  @Post()
  @OrgRoles(OrgRole.ADMIN, OrgRole.EDITOR)
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateDatasetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.datasetsService.create(organizationId, dto, user.id);
  }

  @Delete(':datasetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OrgRoles(OrgRole.ADMIN)
  remove(@Param('organizationId') organizationId: string, @Param('datasetId') datasetId: string) {
    return this.datasetsService.remove(organizationId, datasetId);
  }
}
