import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import type { CreateOrganizationDto } from './dto/create-organization.dto.js';
import type { AddMemberDto } from './dto/add-member.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  findAll() {
    return this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { datasets: true, members: true } } },
    });
  }

  findRecent(limit: number) {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { _count: { select: { datasets: true, members: true } } },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, email: true, fullName: true } } } } },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'organization_not_found',
        message: 'Organization not found.',
      });
    }
    return org;
  }

  create(dto: CreateOrganizationDto, creatorId: string) {
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        members: {
          create: { userId: creatorId, role: OrgRole.ADMIN },
        },
      },
    });
  }

  addMember(organizationId: string, dto: AddMemberDto) {
    return this.prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: dto.userId, organizationId } },
      create: { organizationId, userId: dto.userId, role: dto.role },
      update: { role: dto.role },
    });
  }

  removeMember(organizationId: string, userId: string) {
    return this.prisma.organizationMember.delete({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  async remove(organizationId: string): Promise<void> {
    await this.findOne(organizationId);

    const [datasets, analyses] = await Promise.all([
      this.prisma.dataset.findMany({ where: { organizationId }, select: { id: true } }),
      this.prisma.analysis.findMany({ where: { dataset: { organizationId } }, select: { resultStorageKey: true } }),
    ]);

    await this.prisma.organization.delete({ where: { id: organizationId } });

    await Promise.all([
      ...datasets.map((d) => this.storage.removeDir(d.id)),
      ...analyses.filter((a) => a.resultStorageKey).map((a) => this.storage.remove(a.resultStorageKey!)),
    ]);
  }
}
