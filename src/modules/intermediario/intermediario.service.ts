import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IntermediarioDatasetSummary {
  id: number;
  name: string;
  year: number;
  rowCount: number;
  mappedColumns: number;
  totalColumns: number;
}

export interface IntermediarioSurveySummary {
  id: number;
  name: string;
  description: string | null;
  datasets: IntermediarioDatasetSummary[];
}

@Injectable()
export class IntermediarioService {
  constructor(private readonly configService: ConfigService) {}

  private baseUrl(): string {
    return this.configService.getOrThrow<string>('INTERMEDIARIO_URL').replace(/\/+$/, '');
  }

  async listCatalog(): Promise<IntermediarioSurveySummary[]> {
    const res = await this.safeFetch(`${this.baseUrl()}/api/surveys`);
    return (await res.json()) as IntermediarioSurveySummary[];
  }

  async fetchHarmonizedParquet(kind: 'survey' | 'dataset', sourceId: number): Promise<Buffer> {
    const segment = kind === 'survey' ? 'surveys' : 'datasets';
    const res = await this.safeFetch(`${this.baseUrl()}/api/${segment}/${sourceId}/harmonized.parquet`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async safeFetch(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BadGatewayException({
        code: 'intermediario_unreachable',
        message: 'Could not reach the intermediario (sectei-intermediario). Is it running?',
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadGatewayException({
        code: 'intermediario_error_response',
        message: `The intermediario responded ${res.status}${body ? `: ${body.slice(0, 200)}` : '.'}`,
      });
    }
    return res;
  }
}
