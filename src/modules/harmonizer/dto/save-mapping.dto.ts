import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { MappingChoiceDto } from './mapping-choice.dto.js';

export class SaveMappingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MappingChoiceDto)
  columns!: MappingChoiceDto[];
}
