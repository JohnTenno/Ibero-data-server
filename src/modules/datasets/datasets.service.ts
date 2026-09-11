import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import type { CreateDatasetDto } from './dto/create-dataset.dto.js';

@Injectable()
export class DatasetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

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
      throw new NotFoundException({ code: 'dataset_not_found', message: 'Dataset not found.' });
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
        throw new BadRequestException({
          code: 'revision_source_not_found',
          message: 'The original dataset for this revision does not exist in this organization.',
        });
      }
      if (original.supersededById) {
        throw new BadRequestException({
          code: 'dataset_already_superseded',
          message: 'That dataset already has a more recent revision.',
        });
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
  
  async remove(organizationId: string, datasetId: string): Promise<void> {
    const dataset = await this.findOne(organizationId, datasetId);

    await this.prisma.dataset.updateMany({ where: { revisionOfId: datasetId }, data: { revisionOfId: null } });
    await this.prisma.dataset.updateMany({ where: { supersededById: datasetId }, data: { supersededById: null } });

    const analyses = await this.prisma.analysis.findMany({ where: { datasetId }, select: { resultStorageKey: true } });

    await this.prisma.dataset.delete({ where: { id: dataset.id } });

    await Promise.all([
      this.storage.removeDir(datasetId),
      ...analyses.filter((a) => a.resultStorageKey).map((a) => this.storage.remove(a.resultStorageKey!)),
    ]);
  }
}
