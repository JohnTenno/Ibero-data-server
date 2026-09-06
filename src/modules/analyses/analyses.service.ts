import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { AnalysisService } from '../analysis/analysis.service.js';
import { stepsToInternal, roundRows, type Recipe } from '../analysis/recipe.js';
import type { ColumnInfo } from '../analysis/analysis.service.js';
import type { PreviewAnalysisDto } from './dto/preview-analysis.dto.js';
import type { CreateAnalysisDto } from './dto/create-analysis.dto.js';

const DEFAULT_SAMPLE = 100;

function referencedColumns(recipe: Recipe): { required: Set<string>; produced: Set<string> } {
  const required = new Set<string>();
  const produced = new Set<string>();

  for (const c of recipe.computes) {
    for (const operand of [c.left, c.right]) {
      if (typeof operand === 'string' && Number.isNaN(Number(operand.trim()))) {
        required.add(operand);
      }
    }
    produced.add(c.as);
  }
  for (const a of recipe.aggregates) {
    if (a.column !== '*') required.add(a.column);
    produced.add(a.as);
  }
  for (const c of recipe.groupBy) required.add(c);
  for (const f of recipe.filters) required.add(f.column);
  for (const s of recipe.sort) required.add(s.column);

  return { required, produced };
}

@Injectable()
export class AnalysesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly analysisService: AnalysisService,
  ) {}

  private async getResourceForDataset(datasetId: string, resourceId: string) {
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, datasetId } });
    if (!resource) {
      throw new NotFoundException('Resource no encontrado en este dataset.');
    }
    return resource;
  }

  private validateColumns(recipe: Recipe, schema: ColumnInfo[] | null) {
    if (!schema || schema.length === 0) {
      return;
    }
    const { required, produced } = referencedColumns(recipe);
    const known = new Set([...schema.map((c) => c.name), ...produced]);
    const missing = [...required].filter((name) => !known.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(`Columna(s) inexistente(s) en el recurso: ${missing.join(', ')}`);
    }
  }

  async preview(datasetId: string, dto: PreviewAnalysisDto) {
    const resource = await this.getResourceForDataset(datasetId, dto.resourceId);
    const path = this.storage.resolvePath(resource.storageKey);
    const recipe = stepsToInternal(dto.steps);
    recipe.roundDecimals = dto.roundDecimals ?? null;

    this.validateColumns(recipe, resource.columns as unknown as ColumnInfo[] | null);

    const sample = dto.sampleRows ?? DEFAULT_SAMPLE;
    const result = await this.analysisService.runRecipe(path, recipe, sample);
    return {
      columns: result.columns,
      rows: roundRows(result.rows, recipe.roundDecimals),
      rowCount: result.rows.length,
    };
  }

  async create(datasetId: string, dto: CreateAnalysisDto, userId: string) {
    const existingSlug = await this.prisma.analysis.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) {
      throw new ConflictException('Ya existe un análisis con ese slug.');
    }

    const resource = await this.getResourceForDataset(datasetId, dto.resourceId);
    const recipe = stepsToInternal(dto.steps);
    recipe.roundDecimals = dto.roundDecimals ?? null;
    this.validateColumns(recipe, resource.columns as unknown as ColumnInfo[] | null);

    const analysis = await this.prisma.analysis.create({
      data: {
        datasetId,
        sourceResourceId: dto.resourceId,
        title: dto.title,
        slug: dto.slug,
        folder: dto.folder,
        description: dto.description,
        visibility: dto.visibility,
        recipe: dto.steps as unknown as object,
        status: 'RUNNING',
        createdById: userId,
      },
    });

    try {
      const sourcePath = this.storage.resolvePath(resource.storageKey);
      const resultKey = `analyses/${analysis.id}.parquet`;
      const resultPath = this.storage.resolvePath(resultKey);
      await this.storage.ensureDir(resultKey);
      await this.analysisService.writeRecipeResult(sourcePath, recipe, resultPath);

      const resultSchema = await this.analysisService.describeSchema(resultPath);
      const countResult = await this.analysisService.runQuery(resultPath, 'SELECT COUNT(*) AS n FROM data');
      const rowCount = Number((countResult.rows[0] as any)?.n ?? 0);

      return this.prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          status: 'DONE',
          resultStorageKey: resultKey,
          resultColumns: resultSchema as unknown as object,
          resultRowCount: rowCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al generar el análisis.';
      await this.prisma.analysis.update({
        where: { id: analysis.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw err;
    }
  }

  findAll(datasetId: string) {
    return this.prisma.analysis.findMany({ where: { datasetId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(datasetId: string, analysisId: string) {
    const analysis = await this.prisma.analysis.findFirst({ where: { id: analysisId, datasetId } });
    if (!analysis) {
      throw new NotFoundException('Análisis no encontrado.');
    }
    return analysis;
  }

  async getData(datasetId: string, analysisId: string) {
    const analysis = await this.findOne(datasetId, analysisId);
    if (analysis.status !== 'DONE' || !analysis.resultStorageKey) {
      throw new BadRequestException('Este análisis todavía no tiene un resultado listo.');
    }
    const path = this.storage.resolvePath(analysis.resultStorageKey);
    return this.analysisService.runQuery(path, 'SELECT * FROM data LIMIT 1000');
  }
}
