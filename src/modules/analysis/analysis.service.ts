import { BadRequestException, Injectable } from '@nestjs/common';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { assertReadOnlySelect } from './sql-sanitizer.js';
import { buildRecipeSql, type Recipe } from './recipe.js';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ColumnInfo {
  name: string;
  type: string;
}

const MAX_ROWS = 10_000;

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function stripTrailingSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

function safeDuckDbError(err: unknown, parquetPath: string): BadRequestException {
  const message = err instanceof Error ? err.message : 'Error desconocido de DuckDB.';
  return new BadRequestException(message.split(parquetPath).join('<archivo>'));
}

@Injectable()
export class AnalysisService {
  private async withDataView<T>(
    parquetPath: string,
    fn: (connection: DuckDBConnection) => Promise<T>,
  ): Promise<T> {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
      await connection.run(
        `CREATE OR REPLACE TEMP VIEW data AS SELECT * FROM read_parquet('${escapeSqlLiteral(parquetPath)}')`,
      );
      return await fn(connection);
    } finally {
      connection.closeSync();
    }
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
      throw safeDuckDbError(err, parquetPath);
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
      throw safeDuckDbError(err, parquetPath);
    }
  }

  async runRecipe(parquetPath: string, recipe: Recipe, limit: number | null): Promise<QueryResult> {
    const { sql, params } = buildRecipeSql(recipe, limit);
    try {
      return await this.withDataView(parquetPath, async (connection) => {
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
      throw safeDuckDbError(err, parquetPath);
    }
  }

  async writeRecipeResult(parquetPath: string, recipe: Recipe, destPath: string): Promise<void> {
    const { sql, params } = buildRecipeSql(recipe, null);
    try {
      await this.withDataView(parquetPath, async (connection) => {
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
      throw safeDuckDbError(err, parquetPath);
    }
  }
}
