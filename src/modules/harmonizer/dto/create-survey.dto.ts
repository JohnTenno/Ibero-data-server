import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSurveyDto {
  @IsString()
  @MinLength(1, { message: 'name cannot be empty' })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
