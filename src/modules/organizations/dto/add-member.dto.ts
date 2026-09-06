import { IsEnum, IsUUID } from 'class-validator';
import { OrgRole } from '@prisma/client';

export class AddMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}
