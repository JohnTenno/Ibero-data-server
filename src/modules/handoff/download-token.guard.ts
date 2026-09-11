import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';

@Injectable()
export class DownloadTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    if (!header) {
      throw new UnauthorizedException({
        code: 'download_token_required',
        message: 'Missing download token.',
      });
    }
    const token = header.replace(/^Bearer\s+/i, '').trim();

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'download_token_invalid',
        message: 'Invalid or expired download token.',
      });
    }

    const user = await this.authService.validateUser(payload);
    if (!user) {
      throw new UnauthorizedException({
        code: 'download_token_invalid',
        message: 'Invalid or expired download token.',
      });
    }
    request.user = user;
    return true;
  }
}
