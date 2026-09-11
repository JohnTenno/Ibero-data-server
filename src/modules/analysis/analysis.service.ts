import { BadRequestException, Injectable } from '@nestjs/common';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { assertReadOnlySelect } from './sql-sanitizer.js';
import { buildRecipeSql, quoteIdent, type Recipe } from './recipe.js';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface NamedSource {
  alias: string;
  path: string;
}

const MAX_ROWS = 10_000;

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function stripTrailingSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

function safeDuckDbError(err: unknown, paths: string[], code = 'query_execution_failed'): BadRequestException {
  let message = err instanceof Error ? err.message : 'Unknown DuckDB error.';
  for (const path of paths) {
    message = message.split(path).join('<file>');
  }
  return new BadRequestException({ code, message });
}

@Injectable()
export class AnalysisService {
  private async withViews<T>(
    sources: NamedSource[],
    fn: (connection: DuckDBConnection) => Promise<T>,
  ): Promise<T> {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      for (const source of sources) {
        await connection.run(
          `CREATE OR REPLACE TEMP VIEW ${quoteIdent(source.alias)} AS SELECT * FROM read_parquet('${escapeSqlLiteral(source.path)}')`,
        );
      }
      return await fn(connection);
    } finally {
      connection.closeSync();
    }
  }

  private withDataView<T>(parquetPath: string, fn: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    return this.withViews([{ alias: 'data', path: parquetPath }], fn);
  }

  async runQuery(parquetPath: string, sql: string): Promise<QueryResult> {
    assertReadOnlySelect(sql);
    try {
      return await this.withDataView(parquetPath, async (connection) => {
        const userSql = stripTrailingSemicolon(sql);
        const wrapped = `SELECT * FROM (${userSql}) AS _ibero_query LIMIT ${MAX_ROWS}`;
        const reader = await connection.runAndReadAll(wrapped);
        return {
          columns: reader.columnNames(),
          rows: reader.getRowObjectsJson() as Record<string, unknown>[],
        };
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw safeDuckDbError(err, [parquetPath]);
    }
  }

  async describeSchema(parquetPath: string): Promise<ColumnInfo[]> {
    try {
      return await this.withDataView(parquetPath, async (connection) => {
        const reader = await connection.runAndReadAll('DESCRIBE SELECT * FROM data');
        return reader.getRowObjectsJson().map((row: any) => ({
          name: String(row.column_name),
          type: String(row.column_type),
        }));
      });
    } catch (err) {
      throw safeDuckDbError(err, [parquetPath], 'schema_read_failed');
    }
  }

  async runRecipe(
    parquetPath: string,
    recipe: Recipe,
    limit: number | null,
    joinSources: NamedSource[] = [],
  ): Promise<QueryResult> {
    const { sql, params } = buildRecipeSql(recipe, limit);
    const sources = [{ alias: 'data', path: parquetPath }, ...joinSources];
    try {
      return await this.withViews(sources, async (connection) => {
        const prepared = await connection.prepare(sql);
        params.forEach((value, i) => {
          const idx = i + 1;
          if (typeof value === 'number') {
            Number.isInteger(value) ? prepared.bindInteger(idx, value) : prepared.bindDouble(idx, value);
          } else {
            prepared.bindVarchar(idx, String(value));
          }
        });
        const reader = await prepared.runAndReadAll();
        return {
          columns: reader.columnNames(),
          rows: reader.getRowObjectsJson() as Record<string, unknown>[],
        };
      });
    } catch (err) {
      throw safeDuckDbError(
        err,
        sources.map((s) => s.path),
        'recipe_execution_failed',
      );
    }
  }

  async writeRecipeResult(
    parquetPath: string,
    recipe: Recipe,
    destPath: string,
    joinSources: NamedSource[] = [],
  ): Promise<void> {
    const { sql, params } = buildRecipeSql(recipe, null);
    const sources = [{ alias: 'data', path: parquetPath }, ...joinSources];
    try {
      await this.withViews(sources, async (connection) => {
        const prepared = await connection.prepare(
          `COPY (${sql}) TO '${escapeSqlLiteral(destPath)}' (FORMAT PARQUET)`,
        );
        params.forEach((value, i) => {
          const idx = i + 1;
          if (typeof value === 'number') {
            Number.isInteger(value) ? prepared.bindInteger(idx, value) : prepared.bindDouble(idx, value);
          } else {
            prepared.bindVarchar(idx, String(value));
          }
        });
        await prepared.run();
      });
    } catch (err) {
      throw safeDuckDbError(
        err,
        sources.map((s) => s.path),
        'recipe_execution_failed',
      );
    }
  }
}
