import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';

function makeDeps() {
  const orgs = new Map<string, any>();
  const analyses = new Map<string, any>();
  const datasetOrgById = new Map<string, string>();

  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: any) => {
        const o = orgs.get(where.id);
        return o ? { ...o, members: [] } : null;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const o = orgs.get(where.id);
        orgs.delete(where.id);
        return o;
      }),
    },
    dataset: {
      findMany: vi.fn(async ({ where }: any) => {
        const orgId = where.organizationId;
        return [...datasetOrgById.entries()].filter(([, o]) => o === orgId).map(([id]) => ({ id }));
      }),
    },
    analysis: {
      findMany: vi.fn(async ({ where }: any) => {
        const orgId = where.dataset.organizationId;
        return [...analyses.values()].filter((a) => datasetOrgById.get(a.datasetId) === orgId);
      }),
    },
  };

  const storage = { remove: vi.fn(async () => undefined), removeDir: vi.fn(async () => undefined) };

  return {
    prisma,
    storage,
    orgs,
    addOrg: (o: any) => orgs.set(o.id, o),
    addDatasetToOrg: (datasetId: string, organizationId: string) => datasetOrgById.set(datasetId, organizationId),
    addAnalysis: (a: any) => analyses.set(a.id, a),
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OrganizationsService(deps.prisma as any, deps.storage as any);
}

describe('OrganizationsService.remove', () => {
  it('borra la organización, la carpeta de CADA uno de sus datasets, y los archivos de sus análisis', async () => {
    const deps = makeDeps();
    deps.addOrg({ id: 'org-1', name: 'Ibero' });
    deps.addDatasetToOrg('d1', 'org-1');
    deps.addDatasetToOrg('d2', 'org-1');
    deps.addAnalysis({ id: 'an1', datasetId: 'd1', resultStorageKey: 'analyses/an1.parquet' });

    const service = makeService(deps);
    await service.remove('org-1');

    expect(deps.orgs.has('org-1')).toBe(false);
    expect(deps.storage.removeDir).toHaveBeenCalledWith('d1');
    expect(deps.storage.removeDir).toHaveBeenCalledWith('d2');
    expect(deps.storage.remove).toHaveBeenCalledWith('analyses/an1.parquet');
  });

  it('no toca la carpeta de un dataset de OTRA organización', async () => {
    const deps = makeDeps();
    deps.addOrg({ id: 'org-1', name: 'Ibero' });
    deps.addOrg({ id: 'org-2', name: 'Otra' });
    deps.addDatasetToOrg('d1', 'org-1');
    deps.addDatasetToOrg('d-ajeno', 'org-2');

    const service = makeService(deps);
    await service.remove('org-1');

    expect(deps.storage.removeDir).not.toHaveBeenCalledWith('d-ajeno');
  });

  it('rechaza borrar una organización que no existe', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    await expect(service.remove('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.prisma.organization.delete).not.toHaveBeenCalled();
  });
});
