import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DatasetVisibility, PeriodType, Survey } from '@prisma/client';

export class CreateDatasetDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug can only contain lowercase letters, numbers and hyphens' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DatasetVisibility)
  visibility?: DatasetVisibility;

  @IsOptional()
  @IsEnum(Survey)
  survey?: Survey;

  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2099)
  year?: number;

  @IsOptional()
  @IsEnum(PeriodType)
  periodType?: PeriodType;

  @IsOptional()
  @IsString()
  sourceOrg?: string;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  licenseId?: string;

  @IsOptional()
  @IsUUID()
  revisionOfId?: string;

  @IsOptional()
  @IsString()
  changelog?: string;
}
