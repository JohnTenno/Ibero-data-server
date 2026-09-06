import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Resource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { AnalysisService, type NamedSource } from '../analysis/analysis.service.js';
import { stepsToInternal, roundRows, type Recipe, type Step } from '../analysis/recipe.js';
import type { ColumnInfo } from '../analysis/analysis.service.js';
import type { PreviewAnalysisDto } from './dto/preview-analysis.dto.js';
import type { CreateAnalysisDto } from './dto/create-analysis.dto.js';

interface RecipeInputDto {
  resourceId: string;
  steps: Step[];
  roundDecimals?: number;
}

const DEFAULT_SAMPLE = 100;
function referencedColumns(recipe: Recipe): { required: Set<string>; produced: Set<string> } {
  const required = new Set<string>();
  const produced = new Set<string>();

  for (const j of recipe.joins) {
    required.add(j.onLeft);
    required.add(j.onRight);
  }
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

  private async resolveJoinSources(
    datasetId: string,
    recipe: Recipe,
  ): Promise<{ sources: NamedSource[]; schemas: (ColumnInfo[] | null)[] }> {
    const sources: NamedSource[] = [];
    const schemas: (ColumnInfo[] | null)[] = [];
    const seenAliases = new Set<string>(['data']);

    for (const join of recipe.joins) {
      if (seenAliases.has(join.alias)) {
        throw new BadRequestException(`Alias de join repetido o reservado: "${join.alias}".`);
      }
      seenAliases.add(join.alias);

      const resource = await this.getResourceForDataset(datasetId, join.resourceId);
      sources.push({ alias: join.alias, path: this.storage.resolvePath(resource.storageKey) });
      schemas.push(resource.columns as unknown as ColumnInfo[] | null);
    }
    return { sources, schemas };
  }

  private validateColumns(recipe: Recipe, schemas: (ColumnInfo[] | null)[]) {
    const known = new Set<string>();
    let hasAnySchema = false;
    for (const schema of schemas) {
      if (!schema || schema.length === 0) continue;
      hasAnySchema = true;
      for (const c of schema) known.add(c.name);
    }
    if (!hasAnySchema) {
    return;
    }

    const { required, produced } = referencedColumns(recipe);
    for (const p of produced) known.add(p);

    const missing = [...required].filter((name) => !known.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(`Columna(s) inexistente(s) en los recursos: ${missing.join(', ')}`);
    }
  }

  private async prepareRecipe(
    datasetId: string,
    dto: RecipeInputDto,
  ): Promise<{ resource: Resource; recipe: Recipe; joinSources: NamedSource[] }> {
    const resource = await this.getResourceForDataset(datasetId, dto.resourceId);
    const recipe = stepsToInternal(dto.steps);
    recipe.roundDecimals = dto.roundDecimals ?? null;

    const { sources: joinSources, schemas: joinSchemas } = await this.resolveJoinSources(datasetId, recipe);
    this.validateColumns(recipe, [resource.columns as unknown as ColumnInfo[] | null, ...joinSchemas]);

    return { resource, recipe, joinSources };
  }

  private async writeAndPersist(analysisId: string, resource: Resource, recipe: Recipe, joinSources: NamedSource[]) {
    try {
      const sourcePath = this.storage.resolvePath(resource.storageKey);
      const resultKey = `analyses/${analysisId}.parquet`;
      const resultPath = this.storage.resolvePath(resultKey);
      await this.storage.ensureDir(resultKey);
      await this.analysisService.writeRecipeResult(sourcePath, recipe, resultPath, joinSources);

      const resultSchema = await this.analysisService.describeSchema(resultPath);
      const countResult = await this.analysisService.runQuery(resultPath, 'SELECT COUNT(*) AS n FROM data');
      const rowCount = Number((countResult.rows[0] as any)?.n ?? 0);

      return this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: 'DONE',
          resultStorageKey: resultKey,
          resultColumns: resultSchema as unknown as object,
          resultRowCount: rowCount,
          errorMessage: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al generar el análisis.';
      await this.prisma.analysis.update({
        where: { id: analysisId },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw err;
    }
  }

  async preview(datasetId: string, dto: PreviewAnalysisDto) {
    const { resource, recipe, joinSources } = await this.prepareRecipe(datasetId, dto);
    const path = this.storage.resolvePath(resource.storageKey);

    const sample = dto.sampleRows ?? DEFAULT_SAMPLE;
    const result = await this.analysisService.runRecipe(path, recipe, sample, joinSources);
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

    const { resource, recipe, joinSources } = await this.prepareRecipe(datasetId, dto);

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

    return this.writeAndPersist(analysis.id, resource, recipe, joinSources);
  }

  async update(datasetId: string, analysisId: string, dto: CreateAnalysisDto) {
    await this.findOne(datasetId, analysisId);

    const existingSlug = await this.prisma.analysis.findUnique({ where: { slug: dto.slug } });
    if (existingSlug && existingSlug.id !== analysisId) {
      throw new ConflictException('Ya existe un análisis con ese slug.');
    }

    const { resource, recipe, joinSources } = await this.prepareRecipe(datasetId, dto);

    await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        sourceResourceId: dto.resourceId,
        title: dto.title,
        slug: dto.slug,
        folder: dto.folder,
        description: dto.description,
        visibility: dto.visibility,
        recipe: dto.steps as unknown as object,
        status: 'RUNNING',
      },
    });

    return this.writeAndPersist(analysisId, resource, recipe, joinSources);
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

  async remove(datasetId: string, analysisId: string): Promise<void> {
    const analysis = await this.findOne(datasetId, analysisId);
    await this.prisma.analysis.delete({ where: { id: analysisId } });
    if (analysis.resultStorageKey) {
      await this.storage.remove(analysis.resultStorageKey);
    }
  }
}
