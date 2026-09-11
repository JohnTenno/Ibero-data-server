import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { access } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { AnalysisService } from '../analysis/analysis.service.js';

const PARQUET_MAGIC = Buffer.from('PAR1', 'ascii');

function looksLikeParquet(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer.subarray(0, 4).equals(PARQUET_MAGIC) &&
    buffer.subarray(-4).equals(PARQUET_MAGIC)
  );
}

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly analysisService: AnalysisService,
  ) {}

  findAll(datasetId: string) {
    return this.prisma.resource.findMany({ where: { datasetId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(datasetId: string, resourceId: string) {
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, datasetId } });
    if (!resource) {
      throw new NotFoundException({ code: 'resource_not_found', message: 'Resource not found.' });
    }
    return resource;
  }

  async upload(datasetId: string, file: { originalname: string; buffer: Buffer; size: number }) {
    if (!file.originalname.toLowerCase().endsWith('.parquet')) {
      throw new BadRequestException({
        code: 'invalid_file_extension',
        message: 'Only .parquet files are accepted.',
      });
    }
    if (!looksLikeParquet(file.buffer)) {
      throw new BadRequestException({
        code: 'invalid_parquet_format',
        message: 'The file is not a valid Parquet file.',
      });
    }

    const storageKey = await this.storage.save(datasetId, file.originalname, file.buffer);
    const absolutePath = this.storage.resolvePath(storageKey);

    let columns: unknown = null;
    try {
      columns = await this.analysisService.describeSchema(absolutePath);
    } catch {
      columns = null;
    }

    return this.prisma.resource.create({
      data: {
        datasetId,
        filename: file.originalname,
        format: 'parquet',
        sizeBytes: file.size,
        storageKey,
        columns: columns as any,
      },
    });
  }

  async resolveFilePath(datasetId: string, resourceId: string): Promise<string> {
    const resource = await this.findOne(datasetId, resourceId);
    const path = this.storage.resolvePath(resource.storageKey);
    try {
      await access(path);
    } catch {
      throw new NotFoundException({
        code: 'resource_file_missing',
        message: 'This resource\'s file is no longer in storage (was it deleted manually?).',
      });
    }
    return path;
  }
}
