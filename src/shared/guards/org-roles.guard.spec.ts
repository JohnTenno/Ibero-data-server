import {
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { OrgRole } from '@prisma/client';
import type { PrismaService } from '../../modules/prisma/prisma.service.js';
import { OrgRolesGuard } from './org-roles.guard.js';

const EXISTING_ORG = 'org-1';

function makeGuard(
  requiredRoles: OrgRole[] | undefined,
  membershipRole: OrgRole | null = null,
) {
  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === EXISTING_ORG ? { id: where.id } : null,
      ),
    },
    organizationMember: {
      findUnique: vi.fn(async () =>
        membershipRole ? { role: membershipRole } : null,
      ),
    },
  };
  const reflector = { get: vi.fn(() => requiredRoles) };
  const guard = new OrgRolesGuard(
    reflector as unknown as Reflector,
    prisma as unknown as PrismaService,
  );
  return { guard, prisma };
}

function makeContext(
  params: Record<string, string>,
  user: { id: string; isSysadmin: boolean },
) {
  return {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
  } as unknown as ExecutionContext;
}

const sysadmin = { id: 'admin', isSysadmin: true };
const regularUser = { id: 'user', isSysadmin: false };

describe('OrgRolesGuard', () => {
  it('returns 404 for a sysadmin when the organization does not exist', async () => {
    const { guard } = makeGuard(['ADMIN', 'EDITOR']);
    await expect(
      guard.canActivate(makeContext({ organizationId: 'new' }, sysadmin)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 instead of 403 for a regular user when the organization does not exist', async () => {
    const { guard } = makeGuard(['ADMIN', 'EDITOR']);
    await expect(
      guard.canActivate(makeContext({ organizationId: 'new' }, regularUser)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 on routes without required roles when the organization does not exist', async () => {
    const { guard } = makeGuard(undefined);
    await expect(
      guard.canActivate(makeContext({ organizationId: 'new' }, regularUser)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a sysadmin through when the organization exists', async () => {
    const { guard } = makeGuard(['ADMIN']);
    await expect(
      guard.canActivate(
        makeContext({ organizationId: EXISTING_ORG }, sysadmin),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a member without the required role in an existing organization', async () => {
    const { guard } = makeGuard(['ADMIN'], 'MEMBER');
    await expect(
      guard.canActivate(
        makeContext({ organizationId: EXISTING_ORG }, regularUser),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('skips the organization lookup on routes without :organizationId', async () => {
    const { guard, prisma } = makeGuard(undefined);
    await expect(guard.canActivate(makeContext({}, regularUser))).resolves.toBe(
      true,
    );
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
