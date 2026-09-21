import { Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import type { CreateOrganizationDto } from './dto/create-organization.dto.js';
import type { AddMemberDto } from './dto/add-member.dto.js';

export type OrganizationSort = 'recent' | 'name-asc' | 'name-desc' | 'datasets-desc' | 'members-desc';

export interface ListOrganizationsParams {
  q?: string;
  /** Extra free-text terms, each ANDed with the rest (filter panel selections). */
  terms?: string[];
  sort?: OrganizationSort;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  private orderBy(sort?: OrganizationSort): Prisma.OrganizationOrderByWithRelationInput {
    switch (sort) {
      case 'name-asc':
        return { name: 'asc' };
      case 'name-desc':
        return { name: 'desc' };
      case 'datasets-desc':
        return { datasets: { _count: 'desc' } };
      case 'members-desc':
        return { members: { _count: 'desc' } };
      case 'recent':
      default:
        return { createdAt: 'desc' };
    }
  }

  private termWhere(term: string): Prisma.OrganizationWhereInput {
    const t = term.trim();
    return {
      OR: [
        { name: { contains: t, mode: 'insensitive' } },
        { description: { contains: t, mode: 'insensitive' } },
      ],
    };
  }

  async findAll(params: ListOrganizationsParams = {}) {
    const q = (params.q ?? '').trim();
    const terms = (params.terms ?? []).map((t) => t.trim()).filter(Boolean);
    const limit = clampLimit(params.limit);
    const offset = Math.max(params.offset ?? 0, 0);
    const and: Prisma.OrganizationWhereInput[] = [
      ...(q ? [this.termWhere(q)] : []),
      ...terms.map((t) => this.termWhere(t)),
    ];
    const where: Prisma.OrganizationWhereInput = and.length ? { AND: and } : {};

    const [total, items] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: this.orderBy(params.sort),
        take: limit,
        skip: offset,
        include: { _count: { select: { datasets: true, members: true } } },
      }),
    ]);

    return { total, items };
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
