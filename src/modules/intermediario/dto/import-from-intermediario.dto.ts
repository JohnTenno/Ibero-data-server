import { IsIn, IsInt, IsString, Matches } from 'class-validator';

export class ImportFromIntermediarioDto {
  @IsIn(['survey', 'dataset'])
  kind!: 'survey' | 'dataset';

  @IsInt()
  sourceId!: number;

  @IsString()
  @Matches(/\.parquet$/i, { message: 'filename debe terminar en .parquet' })
  filename!: string;
}
