import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DatasetVisibility } from '@prisma/client';
import { StepDto } from './step.dto.js';

export class CreateAnalysisDto {
  @IsUUID()
  resourceId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug solo puede tener minúsculas, números y guiones' })
  slug!: string;

  @IsString()
  @MinLength(1)
  folder!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DatasetVisibility)
  visibility?: DatasetVisibility;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  roundDecimals?: number;
}
