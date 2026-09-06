import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDatasetDto } from './dto/create-dataset.dto.js';

@Injectable()
export class DatasetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrganization(organizationId: string) {
    return this.prisma.dataset.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllGlobal(limit?: number) {
    return this.prisma.dataset.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  async findOne(organizationId: string, datasetId: string) {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId, organizationId },
      include: {
        resources: true,
        revisionOf: { select: { id: true, title: true, slug: true, revision: true } },
        revisions: { select: { id: true, title: true, slug: true, revision: true } },
        supersededBy: { select: { id: true, title: true, slug: true, revision: true } },
      },
    });
    if (!dataset) {
      throw new NotFoundException('Dataset no encontrado.');
    }
    return dataset;
  }
  
  async create(organizationId: string, dto: CreateDatasetDto, ownerId: string) {
    const { revisionOfId, changelog, ...rest } = dto;

    let revision = 1;
    if (revisionOfId) {
      const original = await this.prisma.dataset.findFirst({
        where: { id: revisionOfId, organizationId },
      });
      if (!original) {
        throw new BadRequestException('El dataset original de la revisión no existe en esta organización.');
      }
      if (original.supersededById) {
        throw new BadRequestException('Ese dataset ya tiene una revisión más reciente.');
      }
      revision = original.revision + 1;
    }

    const created = await this.prisma.dataset.create({
      data: { ...rest, organizationId, ownerId, revision, revisionOfId, changelog },
    });

    if (revisionOfId) {
      await this.prisma.dataset.update({
        where: { id: revisionOfId },
        data: { supersededById: created.id },
      });
    }

    return created;
  }
}
