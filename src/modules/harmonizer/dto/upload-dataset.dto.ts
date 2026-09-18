import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const NEW_SURVEY = '__new__';

export class UploadDatasetDto {
  @IsString()
  @MinLength(1, { message: 'name cannot be empty' })
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year!: number;

  @IsString()
  @MinLength(1, { message: 'surveyId cannot be empty' })
  surveyId!: string;

  @IsOptional()
  @IsString()
  newSurvey?: string;
}
