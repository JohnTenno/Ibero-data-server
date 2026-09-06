import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { StepDto } from './step.dto.js';

export class PreviewAnalysisDto {
  @IsUUID()
  resourceId!: string;

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  sampleRows?: number;
}
