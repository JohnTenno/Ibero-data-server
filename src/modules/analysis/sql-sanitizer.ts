import { BadRequestException } from '@nestjs/common';

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|attach|detach|copy|pragma|install|load|export|import|call|set|grant|revoke|vacuum|checkpoint|read_parquet|read_csv|read_json|glob)\b/i;

export function assertReadOnlySelect(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new BadRequestException('La consulta no puede estar vacía.');
  }

  const withoutTrailingSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailingSemicolon.includes(';')) {
    throw new BadRequestException('Solo se permite una sentencia por consulta.');
  }

  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon)) {
    throw new BadRequestException('Solo se permiten consultas SELECT.');
  }

  if (FORBIDDEN_KEYWORDS.test(withoutTrailingSemicolon)) {
    throw new BadRequestException('La consulta contiene una palabra no permitida.');
  }
}
