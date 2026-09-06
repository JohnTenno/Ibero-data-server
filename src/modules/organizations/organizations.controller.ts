import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard.js';
import { OrgRolesGuard } from '../../shared/guards/org-roles.guard.js';
import { OrgRoles } from '../../shared/decorators/org-roles.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface.js';
import { OrganizationsService } from './organizations.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';

@Controller('organizations')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get('recent')
  findRecent() {
    return this.organizationsService.findRecent(5);
  }

  @Get(':organizationId')
  findOne(@Param('organizationId') organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.create(dto, user.id);
  }

  @Post(':organizationId/members')
  @OrgRoles(OrgRole.ADMIN)
  addMember(@Param('organizationId') organizationId: string, @Body() dto: AddMemberDto) {
    return this.organizationsService.addMember(organizationId, dto);
  }

  @Delete(':organizationId/members/:userId')
  @OrgRoles(OrgRole.ADMIN)
  removeMember(@Param('organizationId') organizationId: string, @Param('userId') userId: string) {
    return this.organizationsService.removeMember(organizationId, userId);
  }
}
