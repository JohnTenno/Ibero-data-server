import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSurveyDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'name cannot be empty' })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
