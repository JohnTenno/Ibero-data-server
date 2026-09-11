import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, isSysadmin: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'user_not_found', message: 'User not found.' });
    }
    return user;
  }

  findMemberships(userId: string) {
    return this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
    });
  }
}
