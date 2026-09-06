import { Injectable, NotFoundException } from '@nestjs/common';
import { DatasetVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocalStorageService } from '../storage/local-storage.service.js';
import { AnalysisService, type QueryResult } from '../analysis/analysis.service.js';
import { stepsToInternal, toVizCanvasRecipe, type Step } from '../analysis/recipe.js';
import { HandoffService } from '../handoff/handoff.service.js';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface.js';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const DEFAULT_PREVIEW = 500;
const MAX_PREVIEW = 500;

export interface PublicPackage {
  id: string;
  title: string;
  name: string;
  type: 'analysis';
  organization: { id: string; name: string; title: string };
  notes: string | null;
  metadata_created: string;
  metadata_modified: string;
}

export interface PublicResource {
  id: string;
  name: string;
  datastore_active: boolean;
  parquet_schema: unknown;
}

export interface PublicRecipe {
  sourceResourceName: string | null;
  steps: { op: string; params?: Record<string, unknown> }[];
  joinResourceNames: Record<string, string>;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(Math.max(n, min), max);
}

const PUBLIC_DONE_ANALYSIS = { status: 'DONE' as const, dataset: { visibility: DatasetVisibility.PUBLIC } };

const VISITANTE_PUBLICO: AuthenticatedUser = {
  id: 'public',
  email: 'visitante@publico.ibero-data',
  fullName: 'Visitante público',
  isSysadmin: false,
};

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    private readonly analysisService: AnalysisService,
    private readonly handoffService: HandoffService,
  ) {}

  private toPackage(analysis: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    dataset: { organization: { id: string; slug: string; name: string } };
  }): PublicPackage {
    return {
      id: analysis.id,
      title: analysis.title,
      name: analysis.slug,
      type: 'analysis',
      organization: {
        id: analysis.dataset.organization.id,
        name: analysis.dataset.organization.slug,
        title: analysis.dataset.organization.name,
      },
      notes: analysis.description,
      metadata_created: analysis.createdAt.toISOString(),
      metadata_modified: analysis.updatedAt.toISOString(),
    };
  }

  async search(params: { q?: string; limit?: number; offset?: number }): Promise<{ total: number; items: PublicPackage[] }> {
    const q = (params.q ?? '').trim();
    const limit = clampInt(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = clampInt(params.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const where = {
      ...PUBLIC_DONE_ANALYSIS,
      ...(q
        ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { description: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [total, analyses] = await Promise.all([
      this.prisma.analysis.count({ where }),
      this.prisma.analysis.findMany({
        where,
        include: { dataset: { include: { organization: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return { total, items: analyses.map((a) => this.toPackage(a)) };
  }

  async getPackageBySlug(slug: string): Promise<{ pkg: PublicPackage; resources: PublicResource[]; recipe: PublicRecipe }> {
    const analysis = await this.prisma.analysis.findFirst({
      where: { slug, ...PUBLIC_DONE_ANALYSIS },
      include: { dataset: { include: { organization: true } }, sourceResource: true },
    });
    if (!analysis) {
      throw new NotFoundException('No se encontró ese análisis en el catálogo público.');
    }

    const resources: PublicResource[] = [
      { id: analysis.slug, name: analysis.title, datastore_active: false, parquet_schema: analysis.resultColumns ?? [] },
    ];
    const recipe = await this.describeRecipe(analysis);
    return { pkg: this.toPackage(analysis), resources, recipe };
  }

  private async describeRecipe(analysis: {
    datasetId: string;
    recipe: unknown;
    sourceResource: { filename: string } | null;
  }): Promise<PublicRecipe> {
    const steps = Array.isArray(analysis.recipe) ? (analysis.recipe as { op: string; params?: Record<string, unknown> }[]) : [];
    const joinResourceIds = steps
      .filter((s) => s.op === 'join' && typeof s.params?.resourceId === 'string')
      .map((s) => s.params!.resourceId as string);

    let joinResourceNames: Record<string, string> = {};
    if (joinResourceIds.length > 0) {
      const joined = await this.prisma.resource.findMany({
        where: { id: { in: joinResourceIds }, datasetId: analysis.datasetId },
        select: { id: true, filename: true },
      });
      joinResourceNames = Object.fromEntries(joined.map((r) => [r.id, r.filename]));
    }

    return { sourceResourceName: analysis.sourceResource?.filename ?? null, steps, joinResourceNames };
  }

  async previewBySlug(slug: string, limit?: number): Promise<QueryResult> {
    const safeLimit = clampInt(limit, DEFAULT_PREVIEW, 1, MAX_PREVIEW);
    const analysis = await this.prisma.analysis.findFirst({ where: { slug, ...PUBLIC_DONE_ANALYSIS } });
    if (!analysis?.resultStorageKey) {
      throw new NotFoundException('Análisis no encontrado o no es público.');
    }
    const path = this.storage.resolvePath(analysis.resultStorageKey);
    return this.analysisService.runQuery(path, `SELECT * FROM data LIMIT ${safeLimit}`);
  }

  async getResultFile(slug: string): Promise<{ path: string; filename: string }> {
    const analysis = await this.prisma.analysis.findFirst({ where: { slug, ...PUBLIC_DONE_ANALYSIS } });
    if (!analysis?.resultStorageKey) {
      throw new NotFoundException('Análisis no encontrado o no es público.');
    }
    return { path: this.storage.resolvePath(analysis.resultStorageKey), filename: `${analysis.title}.parquet` };
  }

  async getDatasetResourceFile(slug: string, resourceId: string): Promise<{ path: string; filename: string }> {
    const analysis = await this.prisma.analysis.findFirst({ where: { slug, ...PUBLIC_DONE_ANALYSIS } });
    if (!analysis) {
      throw new NotFoundException('Análisis no encontrado o no es público.');
    }
    const resource = await this.prisma.resource.findFirst({ where: { id: resourceId, datasetId: analysis.datasetId } });
    if (!resource) {
      throw new NotFoundException('Resource no encontrado en este dataset.');
    }
    return { path: this.storage.resolvePath(resource.storageKey), filename: resource.filename };
  }

  async buildVizCanvasHandoff(slug: string): Promise<{ url: string }> {
    const analysis = await this.prisma.analysis.findFirst({
      where: { slug, ...PUBLIC_DONE_ANALYSIS },
      include: { sourceResource: true },
    });
    if (!analysis?.sourceResource) {
      throw new NotFoundException('Análisis no encontrado o no es público.');
    }

    const steps = Array.isArray(analysis.recipe) ? (analysis.recipe as unknown as Step[]) : [];
    const recipe = stepsToInternal(steps);
    const vizCanvasRecipe = toVizCanvasRecipe(recipe);

    const base = this.handoffService.apiBaseUrl();
    const resultDownloadUrl = `${base}/public/catalog/${analysis.slug}/download`;
    const sourceDownloadUrl = `${base}/public/catalog/${analysis.slug}/resources/${analysis.sourceResource.id}/download`;

    const joinResourceIds = recipe.joins.map((j) => j.resourceId);
    const joinResources: { alias: string; downloadUrl: string; filename: string }[] = [];
    if (joinResourceIds.length > 0) {
      const joined = await this.prisma.resource.findMany({
        where: { id: { in: joinResourceIds }, datasetId: analysis.datasetId },
      });
      const filenameById = new Map(joined.map((r) => [r.id, r.filename]));
      for (const j of recipe.joins) {
        const filename = filenameById.get(j.resourceId);
        if (!filename) continue;
        joinResources.push({
          alias: j.alias,
          downloadUrl: `${base}/public/catalog/${analysis.slug}/resources/${j.resourceId}/download`,
          filename,
        });
      }
    }

    const url = this.handoffService.buildAnalysisHandoffUrl(
      VISITANTE_PUBLICO,
      { downloadUrl: resultDownloadUrl, filename: `${analysis.title}.parquet` },
      { downloadUrl: sourceDownloadUrl, filename: analysis.sourceResource.filename },
      vizCanvasRecipe,
      joinResources,
    );
    return { url };
  }

  async listOrganizations(): Promise<{ id: string; name: string; title: string; description: string | null }[]> {
    const orgs = await this.prisma.organization.findMany({
      where: { datasets: { some: { visibility: DatasetVisibility.PUBLIC, analyses: { some: { status: 'DONE' } } } } },
      orderBy: { name: 'asc' },
    });
    return orgs.map((o) => ({ id: o.id, name: o.slug, title: o.name, description: o.description }));
  }

  async countByOrganization(): Promise<Record<string, { fuentes: number; graficas: number }>> {
    const rows = await this.prisma.analysis.findMany({
      where: PUBLIC_DONE_ANALYSIS,
      select: { datasetId: true, dataset: { select: { organization: { select: { slug: true } } } } },
    });

    const graficas = new Map<string, number>();
    const datasetsPorOrg = new Map<string, Set<string>>();
    for (const r of rows) {
      const slug = r.dataset.organization.slug;
      graficas.set(slug, (graficas.get(slug) ?? 0) + 1);
      if (!datasetsPorOrg.has(slug)) datasetsPorOrg.set(slug, new Set());
      datasetsPorOrg.get(slug)!.add(r.datasetId);
    }

    const out: Record<string, { fuentes: number; graficas: number }> = {};
    for (const slug of graficas.keys()) {
      out[slug] = { fuentes: datasetsPorOrg.get(slug)?.size ?? 0, graficas: graficas.get(slug) ?? 0 };
    }
    return out;
  }
}
