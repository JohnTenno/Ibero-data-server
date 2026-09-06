import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

function sanitizeFilename(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

@Injectable()
export class LocalStorageService {
  private readonly root = resolve(process.cwd(), 'storage');
  private readonly logger = new Logger(LocalStorageService.name);

  async save(datasetId: string, originalFilename: string, buffer: Buffer): Promise<string> {
    const dir = join(this.root, datasetId);
    await mkdir(dir, { recursive: true });

    const key = `${datasetId}/${randomUUID()}-${sanitizeFilename(originalFilename)}`;
    await writeFile(join(this.root, key), buffer);
    return key;
  }

  resolvePath(storageKey: string): string {
    return join(this.root, storageKey);
  }

  async ensureDir(storageKey: string): Promise<void> {
    await mkdir(dirname(this.resolvePath(storageKey)), { recursive: true });
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await rm(this.resolvePath(storageKey), { force: true });
    } catch (err) {
      this.logger.warn(`No se pudo borrar "${storageKey}": ${(err as Error).message}`);
    }
  }

  async removeDir(relativeDir: string): Promise<void> {
    try {
      await rm(this.resolvePath(relativeDir), { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`No se pudo borrar la carpeta "${relativeDir}": ${(err as Error).message}`);
    }
  }
}
