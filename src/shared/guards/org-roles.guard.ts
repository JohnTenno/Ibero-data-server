import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const request = context.switchToHttp().getRequest();
    const organizationId: string | undefined = request.params?.organizationId;

    if (organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new NotFoundException({
          code: 'organization_not_found',
          message: 'Organization not found.',
        });
      }
    }

    const requiredRoles = this.reflector.get<OrgRole[]>(
      ORG_ROLES_KEY,
      context.getHandler(),
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user: AuthenticatedUser | undefined = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'not_authenticated',
        message: 'Not authenticated.',
      });
    }
    if (user.isSysadmin) {
      return true;
    }
    if (!organizationId) {
      throw new ForbiddenException({
        code: 'organization_id_missing',
        message: 'Route without :organizationId; the role cannot be validated.',
      });
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException({
        code: 'insufficient_role',
        message: 'You do not have the required role in this organization.',
      });
    }
    return true;
  }
}
