import { BadGatewayException } from '@nestjs/common';
import { IntermediarioService } from './intermediario.service.js';

function makeConfigService(url = 'http://localhost:8000') {
  return { getOrThrow: vi.fn(() => url) } as any;
}

describe('IntermediarioService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listCatalog', () => {
    it('pide GET /api/surveys y devuelve el catálogo tal cual', async () => {
      const catalog = [{ id: 1, name: 'Socioeconómica', description: null, datasets: [] }];
      global.fetch = vi.fn(async (url: string) => {
        expect(url).toBe('http://localhost:8000/api/surveys');
        return { ok: true, json: async () => catalog } as any;
      }) as any;

      const service = new IntermediarioService(makeConfigService());
      await expect(service.listCatalog()).resolves.toEqual(catalog);
    });

    it('quita la barra final de INTERMEDIARIO_URL antes de armar la URL', async () => {
      global.fetch = vi.fn(async (url: string) => {
        expect(url).toBe('http://localhost:8000/api/surveys');
        return { ok: true, json: async () => [] } as any;
      }) as any;

      const service = new IntermediarioService(makeConfigService('http://localhost:8000/'));
      await service.listCatalog();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchHarmonizedParquet', () => {
    it('pide la ruta de encuesta completa cuando kind="survey"', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      global.fetch = vi.fn(async (url: string) => {
        expect(url).toBe('http://localhost:8000/api/surveys/5/harmonized.parquet');
        return { ok: true, arrayBuffer: async () => bytes.buffer } as any;
      }) as any;

      const service = new IntermediarioService(makeConfigService());
      const buffer = await service.fetchHarmonizedParquet('survey', 5);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect([...buffer]).toEqual([1, 2, 3]);
    });

    it('pide la ruta de un año puntual cuando kind="dataset"', async () => {
      global.fetch = vi.fn(async (url: string) => {
        expect(url).toBe('http://localhost:8000/api/datasets/7/harmonized.parquet');
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as any;
      }) as any;

      const service = new IntermediarioService(makeConfigService());
      await service.fetchHarmonizedParquet('dataset', 7);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('manejo de errores', () => {
    it('si el intermediario no responde (fetch tira), da un 502 con mensaje claro, no el error crudo', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as any;

      const service = new IntermediarioService(makeConfigService());
      await expect(service.listCatalog()).rejects.toBeInstanceOf(BadGatewayException);
      await expect(service.listCatalog()).rejects.toThrow(/no se pudo contactar/i);
    });

    it('si el intermediario responde con error HTTP, también da 502 (no deja pasar un 404/500 crudo)', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => 'Encuesta no encontrada',
      })) as any;

      const service = new IntermediarioService(makeConfigService());
      await expect(service.fetchHarmonizedParquet('survey', 999)).rejects.toBeInstanceOf(BadGatewayException);
      await expect(service.fetchHarmonizedParquet('survey', 999)).rejects.toThrow(/404/);
    });
  });
});
