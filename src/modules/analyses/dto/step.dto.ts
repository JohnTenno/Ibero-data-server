import { IsObject, IsOptional, IsString } from 'class-validator';

export class StepDto {
  @IsString()
  op!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
