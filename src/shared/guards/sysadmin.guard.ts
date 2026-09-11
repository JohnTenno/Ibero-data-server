import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SYSADMIN_ONLY_KEY } from '../decorators/sysadmin.decorator.js';
import type { AuthenticatedUser } from '../../modules/auth/jwt-payload.interface.js';

@Injectable()
export class SysadminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresSysadmin = this.reflector.get<boolean>(SYSADMIN_ONLY_KEY, context.getHandler());
    if (!requiresSysadmin) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user?.isSysadmin) {
      throw new ForbiddenException({
        code: 'sysadmin_required',
        message: 'Sysadmin privileges are required.',
      });
    }
    return true;
  }
}
