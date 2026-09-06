import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug solo puede tener minúsculas, números y guiones' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
