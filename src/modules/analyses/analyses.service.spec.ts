import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalysesService } from './analyses.service.js';
import type { PreviewAnalysisDto } from './dto/preview-analysis.dto.js';

function makeDeps() {
  const resourcesByKey = new Map<string, any>();
  const analysesById = new Map<string, any>();

  const prisma = {
    resource: {
      findFirst: vi.fn(async ({ where }: any) => {
        const found = resourcesByKey.get(where.id);
        if (!found || found.datasetId !== where.datasetId) return null;
        return found;
      }),
    },
    analysis: {
      findUnique: vi.fn(async ({ where }: any) => {
        for (const a of analysesById.values()) {
          if (a.slug === where.slug) return a;
        }
        return null;
      }),
      create: vi.fn(async (args: any) => {
        const created = { id: 'analysis-1', ...args.data };
        analysesById.set(created.id, created);
        return created;
      }),
      update: vi.fn(async (args: any) => {
        const current = analysesById.get(args.where.id) ?? { id: args.where.id };
        const updated = { ...current, ...args.data };
        analysesById.set(args.where.id, updated);
        return updated;
      }),
      findMany: vi.fn(async () => [...analysesById.values()]),
      findFirst: vi.fn(async ({ where }: any) => {
        const found = analysesById.get(where.id);
        if (!found || found.datasetId !== where.datasetId) return null;
        return found;
      }),
    },
  };

  const storage = {
    resolvePath: vi.fn((key: string) => `/storage/${key}`),
    ensureDir: vi.fn(async () => undefined),
  };

  const analysisService = {
    runRecipe: vi.fn(async () => ({ columns: ['a'], rows: [] })),
    writeRecipeResult: vi.fn(async () => undefined),
    describeSchema: vi.fn(async () => []),
    runQuery: vi.fn(async () => ({ columns: [], rows: [{ n: 0 }] })),
  };

  return { prisma, storage, analysisService, resourcesByKey, analysesById };
}

function addResource(
  resourcesByKey: Map<string, any>,
  id: string,
  datasetId: string,
  storageKey: string,
  columns: { name: string; type: string }[] | null,
) {
  resourcesByKey.set(id, { id, datasetId, storageKey, columns });
}

function addAnalysis(analysesById: Map<string, any>, id: string, datasetId: string, slug: string) {
  analysesById.set(id, { id, datasetId, slug, sourceResourceId: 'res-base', status: 'DONE' });
}

describe('AnalysesService: orquestación de join/merge entre recursos', () => {
  it('resuelve el resourceId del join a su path real y lo pasa a AnalysisService.runRecipe', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', [
      { name: 'folio', type: 'BIGINT' },
      { name: 'ingreso', type: 'DOUBLE' },
    ]);
    addResource(resourcesByKey, 'res-join', 'ds-1', 'ds-1/expansion.parquet', [
      { name: 'folio', type: 'BIGINT' },
      { name: 'factor', type: 'DOUBLE' },
    ]);

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const dto: PreviewAnalysisDto = {
      resourceId: 'res-base',
      steps: [
        { op: 'join', params: { resourceId: 'res-join', alias: 'expansion', type: 'inner', onLeft: 'folio', onRight: 'folio' } },
      ],
    } as any;

    await service.preview('ds-1', dto);

    expect(analysisService.runRecipe).toHaveBeenCalledTimes(1);
    const [path, , , joinSources] = analysisService.runRecipe.mock.calls[0] as any[];
    expect(path).toBe('/storage/ds-1/base.parquet');
    expect(joinSources).toEqual([{ alias: 'expansion', path: '/storage/ds-1/expansion.parquet' }]);
  });

  it('rechaza cruzar con un resource de OTRO dataset (límite de seguridad)', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);
    addResource(resourcesByKey, 'res-ajeno', 'ds-2', 'ds-2/otro.parquet', null); // dataset distinto

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const dto: PreviewAnalysisDto = {
      resourceId: 'res-base',
      steps: [
        { op: 'join', params: { resourceId: 'res-ajeno', alias: 'otro', type: 'inner', onLeft: 'folio', onRight: 'folio' } },
      ],
    } as any;

    await expect(service.preview('ds-1', dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(analysisService.runRecipe).not.toHaveBeenCalled();
  });

  it('rechaza un alias de join repetido o igual a "data"', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);
    addResource(resourcesByKey, 'res-join', 'ds-1', 'ds-1/expansion.parquet', null);

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const dto: PreviewAnalysisDto = {
      resourceId: 'res-base',
      steps: [
        { op: 'join', params: { resourceId: 'res-join', alias: 'data', type: 'inner', onLeft: 'folio', onRight: 'folio' } },
      ],
    } as any;

    await expect(service.preview('ds-1', dto)).rejects.toThrow(BadRequestException);
    await expect(service.preview('ds-1', dto)).rejects.toThrow(/Alias de join/);
  });

  it('valida que las columnas del join existan en alguno de los schemas conocidos (base o cruzado)', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', [{ name: 'folio', type: 'BIGINT' }]);
    addResource(resourcesByKey, 'res-join', 'ds-1', 'ds-1/expansion.parquet', [{ name: 'folio', type: 'BIGINT' }]);

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const dto: PreviewAnalysisDto = {
      resourceId: 'res-base',
      steps: [
        {
          op: 'join',
          params: { resourceId: 'res-join', alias: 'expansion', type: 'inner', onLeft: 'folio', onRight: 'columna_inexistente' },
        },
      ],
    } as any;

    await expect(service.preview('ds-1', dto)).rejects.toThrow(/columna_inexistente/);
  });

  it('permite referenciar una columna que solo existe en el resource cruzado (no en el base)', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', [{ name: 'folio', type: 'BIGINT' }]);
    addResource(resourcesByKey, 'res-join', 'ds-1', 'ds-1/expansion.parquet', [
      { name: 'folio', type: 'BIGINT' },
      { name: 'factor', type: 'DOUBLE' },
    ]);

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const dto: PreviewAnalysisDto = {
      resourceId: 'res-base',
      steps: [
        { op: 'join', params: { resourceId: 'res-join', alias: 'expansion', type: 'inner', onLeft: 'folio', onRight: 'folio' } },
        { op: 'sort', params: { column: 'factor', dir: 'desc' } },
      ],
    } as any;

    await expect(service.preview('ds-1', dto)).resolves.toBeDefined();
  });
});

describe('AnalysesService: editar un análisis guardado', () => {
  function baseDto(overrides: Partial<any> = {}) {
    return {
      resourceId: 'res-base',
      title: 'Editado',
      slug: 'editado',
      folder: 'carpeta',
      steps: [{ op: 'limit', params: { n: 10 } }],
      ...overrides,
    };
  }

  it('actualiza metadata + recipe y regenera el resultado (mismo resultStorageKey)', async () => {
    const { prisma, storage, analysisService, resourcesByKey, analysesById } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);
    addAnalysis(analysesById, 'an-1', 'ds-1', 'original');

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);
    const result = await service.update('ds-1', 'an-1', baseDto() as any);

    expect(analysisService.writeRecipeResult).toHaveBeenCalledTimes(1);
    const [, , destPath] = analysisService.writeRecipeResult.mock.calls[0] as any[];
    expect(destPath).toBe('/storage/analyses/an-1.parquet');
    expect(result.status).toBe('DONE');
    expect(result.title).toBe('Editado');
    expect(result.slug).toBe('editado');
  });

  it('rechaza editar un análisis que no existe (o es de otro dataset)', async () => {
    const { prisma, storage, analysisService, resourcesByKey } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);

    await expect(service.update('ds-1', 'no-existe', baseDto() as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(analysisService.writeRecipeResult).not.toHaveBeenCalled();
  });

  it('rechaza cambiar el slug a uno que ya usa OTRO análisis', async () => {
    const { prisma, storage, analysisService, resourcesByKey, analysesById } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);
    addAnalysis(analysesById, 'an-1', 'ds-1', 'uno');
    addAnalysis(analysesById, 'an-2', 'ds-1', 'dos');

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);

    await expect(service.update('ds-1', 'an-1', baseDto({ slug: 'dos' }) as any)).rejects.toThrow(
      /Ya existe un análisis con ese slug/,
    );
  });

  it('permite guardar sin cambiar el slug (no choca consigo mismo)', async () => {
    const { prisma, storage, analysisService, resourcesByKey, analysesById } = makeDeps();
    addResource(resourcesByKey, 'res-base', 'ds-1', 'ds-1/base.parquet', null);
    addAnalysis(analysesById, 'an-1', 'ds-1', 'mismo-slug');

    const service = new AnalysesService(prisma as any, storage as any, analysisService as any);

    await expect(
      service.update('ds-1', 'an-1', baseDto({ slug: 'mismo-slug' }) as any),
    ).resolves.toMatchObject({ status: 'DONE' });
  });
});
