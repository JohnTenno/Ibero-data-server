import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug can only contain lowercase letters, numbers and hyphens' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
