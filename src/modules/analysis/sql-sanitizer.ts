import { BadRequestException } from '@nestjs/common';

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|attach|detach|copy|pragma|install|load|export|import|call|set|grant|revoke|vacuum|checkpoint|read_parquet|read_csv|read_json|glob)\b/i;

export function assertReadOnlySelect(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new BadRequestException({ code: 'query_empty', message: 'The query cannot be empty.' });
  }

  const withoutTrailingSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailingSemicolon.includes(';')) {
    throw new BadRequestException({
      code: 'query_multiple_statements',
      message: 'Only one statement per query is allowed.',
    });
  }

  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon)) {
    throw new BadRequestException({
      code: 'query_select_only',
      message: 'Only SELECT queries are allowed.',
    });
  }

  if (FORBIDDEN_KEYWORDS.test(withoutTrailingSemicolon)) {
    throw new BadRequestException({
      code: 'query_forbidden_keyword',
      message: 'The query contains a keyword that is not allowed.',
    });
  }
}
