import { IsString, MinLength } from 'class-validator';

export class RunQueryDto {
  @IsString()
  @MinLength(1)
  sql!: string;
}
