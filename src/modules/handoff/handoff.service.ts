import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser, JwtPayload } from '../auth/jwt-payload.interface.js';

export interface HandoffPayload {
  username: string;
  displayName: string;
  downloadToken: string;
}

const TTL_MS = 300_000;
const DOWNLOAD_TOKEN_TTL = '10m';

@Injectable()
export class HandoffService {
  private readonly store = new Map<string, { payload: HandoffPayload; expiresAt: number }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  buildResourceHandoffUrl(user: AuthenticatedUser, downloadUrl: string, filename: string): string {
    const token = this.createToken(user);
    const params = new URLSearchParams({
      handoff: token,
      ckan_url: this.apiBaseUrl(),
      resource_url: downloadUrl,
      resource_name: this.safeName(filename),
      resource_format: 'parquet',
    });
    return `${this.vizcanvasUrl()}?${params.toString()}`;
  }

  buildAnalysisHandoffUrl(
    user: AuthenticatedUser,
    result: { downloadUrl: string; filename: string },
    source: { downloadUrl: string; filename: string },
    vizCanvasRecipe: Record<string, unknown>,
  ): string {
    const token = this.createToken(user);
    const pipeline = Buffer.from(JSON.stringify(vizCanvasRecipe)).toString('base64url');
    const params = new URLSearchParams({
      handoff: token,
      ckan_url: this.apiBaseUrl(),
      resource_url: result.downloadUrl,
      resource_name: this.safeName(result.filename),
      resource_format: 'parquet',
      source_resource_url: source.downloadUrl,
      source_resource_name: this.safeName(source.filename),
      pipeline,
    });
    return `${this.vizcanvasUrl()}?${params.toString()}`;
  }

  consume(token: string): HandoffPayload | null {
    const entry = this.store.get(token);
    this.store.delete(token);
    if (!entry || entry.expiresAt < Date.now()) {
      return null;
    }
    return entry.payload;
  }

  private createToken(user: AuthenticatedUser): string {
    this.sweep();
    const downloadToken = this.jwtService.sign(
      { sub: user.id, email: user.email, isSysadmin: user.isSysadmin } satisfies JwtPayload,
      { expiresIn: DOWNLOAD_TOKEN_TTL },
    );
    const token = randomBytes(32).toString('base64url');
    this.store.set(token, {
      payload: { username: user.email, displayName: user.fullName, downloadToken },
      expiresAt: Date.now() + TTL_MS,
    });
    return token;
  }

  private safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60) || 'ibero_data';
  }
  
  apiBaseUrl(): string {
    return this.configService.getOrThrow<string>('API_BASE_URL').replace(/\/+$/, '');
  }

  private vizcanvasUrl(): string {
    return this.configService.getOrThrow<string>('VIZCANVAS_URL').replace(/\/+$/, '');
  }

  private sweep(): void {
    const now = Date.now();
    for (const [token, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(token);
    }
  }
}
