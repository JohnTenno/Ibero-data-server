import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrgRole } from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service.js';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator.js';
import type { AuthenticatedUser } from '../../modules/auth/jwt-payload.interface.js';

@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<OrgRole[]>(ORG_ROLES_KEY, context.getHandler());
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    const organizationId = request.params?.organizationId;

    if (!user) {
      throw new ForbiddenException('No autenticado.');
    }
    if (user.isSysadmin) {
      return true;
    }
    if (!organizationId) {
      throw new ForbiddenException('Ruta sin :organizationId; no se puede validar el rol.');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('No tienes el rol necesario en esta organización.');
    }
    return true;
  }
}
