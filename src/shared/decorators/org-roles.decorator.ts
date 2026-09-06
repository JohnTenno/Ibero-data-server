import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
