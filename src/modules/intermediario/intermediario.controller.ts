import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { OrgRolesGuard } from '../../shared/guards/org-roles.guard.js';
import { OrgRoles } from '../../shared/decorators/org-roles.decorator.js';
import { ResourcesService } from '../datasets/resources.service.js';
import { IntermediarioService } from './intermediario.service.js';
import { ImportFromIntermediarioDto } from './dto/import-from-intermediario.dto.js';

@Controller('organizations/:organizationId/datasets/:datasetId/intermediario')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class IntermediarioController {
  constructor(
    private readonly intermediarioService: IntermediarioService,
    private readonly resourcesService: ResourcesService,
  ) {}

  @Get('catalog')
  @OrgRoles(OrgRole.ADMIN, OrgRole.EDITOR, OrgRole.MEMBER)
  catalog() {
    return this.intermediarioService.listCatalog();
  }

  @Post('import')
  @OrgRoles(OrgRole.ADMIN, OrgRole.EDITOR)
  async import(@Param('datasetId') datasetId: string, @Body() dto: ImportFromIntermediarioDto) {
    const buffer = await this.intermediarioService.fetchHarmonizedParquet(dto.kind, dto.sourceId);
    return this.resourcesService.upload(datasetId, {
      originalname: dto.filename,
      buffer,
      size: buffer.length,
    });
  }
}
