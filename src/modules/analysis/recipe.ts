import { BadRequestException } from '@nestjs/common';
export const ALLOWED_AGG_FUNCS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'MEDIAN']);
export const ALLOWED_OPERATORS = new Set(['=', '!=', '<', '<=', '>', '>=']);
export const ALLOWED_SORT_DIRS = new Set(['asc', 'desc']);
export const OP_CATALOG = {
  group_by: {
    kind: 'group',
    description: 'Agrupa las filas por una o más columnas. Úsalo con cálculos para resumir por grupo.',
    params: ['columns'],
  },
  aggregate: {
    kind: 'agg',
    description: 'Calcula un valor por grupo: suma, promedio, conteo, mínimo, máximo o mediana.',
    params: ['func', 'column', 'as', 'distinct'],
  },
  compute: {
    kind: 'compute',
    description:
      'Crea una columna nueva multiplicando dos columnas (o una columna por un número). Útil para aplicar el factor de expansión de una encuesta.',
    params: ['left', 'right', 'as'],
  },
  percentage: {
    kind: 'post',
    description: 'Convierte un cálculo en su porcentaje del total.',
    params: ['of', 'as'],
  },
  filter: {
    kind: 'row',
    description: 'Conserva solo las filas que cumplen una condición (antes de agrupar).',
    params: ['column', 'operator', 'value'],
  },
  sort: {
    kind: 'post',
    description: 'Ordena el resultado por una columna, ascendente o descendente.',
    params: ['column', 'dir'],
  },
  limit: {
    kind: 'post',
    description: 'Devuelve solo las primeras N filas (top N).',
    params: ['n'],
  },
} as const;

export type OpName = keyof typeof OP_CATALOG;

export interface Step {
  op: string;
  params?: Record<string, unknown>;
}

export interface Recipe {
  computes: { left: string | number; right: string | number; as: string }[];
  filters: { column: string; operator: string; value: string | number }[];
  groupBy: string[];
  aggregates: { func: string; column: string; as: string; distinct?: boolean }[];
  percentage: { of: string; as: string } | null;
  sort: { column: string; dir: string }[];
  limit: number | null;
  roundDecimals: number | null;
}

export function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}
export function stepsToInternal(steps: Step[]): Recipe {
  const recipe: Recipe = {
    computes: [],
    filters: [],
    groupBy: [],
    aggregates: [],
    percentage: null,
    sort: [],
    limit: null,
    roundDecimals: null,
  };

  for (const step of steps) {
    const op = step.op as OpName;
    const p = step.params ?? {};
    if (!(op in OP_CATALOG)) {
      throw new BadRequestException(`Operación desconocida: ${step.op}`);
    }
    switch (op) {
      case 'group_by':
        recipe.groupBy = Array.isArray(p.columns) ? (p.columns as string[]) : [];
        break;
      case 'aggregate':
        recipe.aggregates.push({
          func: String(p.func),
          column: String(p.column),
          as: String(p.as),
          distinct: Boolean(p.distinct),
        });
        break;
      case 'compute':
        recipe.computes.push({
          left: p.left as string | number,
          right: p.right as string | number,
          as: String(p.as),
        });
        break;
      case 'filter':
        recipe.filters.push({
          column: String(p.column),
          operator: String(p.operator),
          value: p.value as string | number,
        });
        break;
      case 'percentage':
        recipe.percentage = { of: String(p.of), as: String(p.as) };
        break;
      case 'sort':
        recipe.sort.push({ column: String(p.column), dir: String(p.dir) });
        break;
      case 'limit':
        recipe.limit = p.n !== undefined && p.n !== null ? Number(p.n) : null;
        break;
    }
  }
  return recipe;
}

function computeOperand(operand: string | number): string {
  if (typeof operand === 'number') {
    return String(operand);
  }
  const s = String(operand).trim();
  if (s !== '' && !Number.isNaN(Number(s))) {
    return s;
  }
  return quoteIdent(s);
}

export function buildRecipeSql(recipe: Recipe, previewLimit: number | null): { sql: string; params: (string | number)[] } {
  let fromClause = 'data';

  if (recipe.computes.length > 0) {
    const parts = recipe.computes.map((c) => {
      const left = computeOperand(c.left);
      const right = computeOperand(c.right);
      return `(${left} * ${right}) AS ${quoteIdent(c.as)}`;
    });
    fromClause = `(SELECT *, ${parts.join(', ')} FROM data) AS data`;
  }

  const params: (string | number)[] = [];
  const where: string[] = [];
  for (const f of recipe.filters) {
    if (!ALLOWED_OPERATORS.has(f.operator)) {
      throw new BadRequestException(`Operador no permitido: ${f.operator}`);
    }
    params.push(f.value);
    where.push(`${quoteIdent(f.column)} ${f.operator} $${params.length}`);
  }

  const selectParts = recipe.groupBy.map((c) => quoteIdent(c));
  const aggAliases: string[] = [];
  for (const a of recipe.aggregates) {
    if (!ALLOWED_AGG_FUNCS.has(a.func)) {
      throw new BadRequestException(`Función no permitida: ${a.func}`);
    }
    let inner = a.column === '*' ? '*' : quoteIdent(a.column);
    if (a.distinct) {
      if (a.column === '*') {
        throw new BadRequestException('count_distinct requiere una columna específica.');
      }
      inner = `DISTINCT ${quoteIdent(a.column)}`;
    }
    selectParts.push(`${a.func}(${inner}) AS ${quoteIdent(a.as)}`);
    aggAliases.push(a.as);
  }

  if (recipe.percentage) {
    const { of: ofAlias, as } = recipe.percentage;
    const aggFor = recipe.aggregates.find((a) => a.as === ofAlias);
    if (!aggFor) {
      throw new BadRequestException(`percentage.of debe referir un agregado: ${ofAlias}`);
    }
    let inner = aggFor.column === '*' ? '*' : quoteIdent(aggFor.column);
    if (aggFor.distinct) inner = `DISTINCT ${inner}`;
    const expr = `${aggFor.func}(${inner})`;
    selectParts.push(`100.0 * ${expr} / SUM(${expr}) OVER () AS ${quoteIdent(as)}`);
  }

  const selectList = selectParts.length > 0 ? selectParts.join(', ') : '*';
  let sql = `SELECT ${selectList} FROM ${fromClause}`;
  if (where.length > 0) {
    sql += ` WHERE ${where.join(' AND ')}`;
  }
  if (recipe.groupBy.length > 0) {
    sql += ` GROUP BY ${recipe.groupBy.map((c) => quoteIdent(c)).join(', ')}`;
  }
  if (recipe.sort.length > 0) {
    const orderParts = recipe.sort.map((s) => {
      if (!ALLOWED_SORT_DIRS.has(s.dir)) {
        throw new BadRequestException(`Dirección de sort no permitida: ${s.dir}`);
      }
      return `${quoteIdent(s.column)} ${s.dir.toUpperCase()}`;
    });
    sql += ` ORDER BY ${orderParts.join(', ')}`;
  }

  const effectiveLimit =
    previewLimit !== null && (recipe.limit === null || recipe.limit > previewLimit)
      ? previewLimit
      : recipe.limit;
  if (effectiveLimit !== null) {
    sql += ` LIMIT ${Math.trunc(effectiveLimit)}`;
  }

  return { sql, params };
}

export function toVizCanvasRecipe(recipe: Recipe): Record<string, unknown> {
  return {
    filters: recipe.filters,
    computes: recipe.computes,
    group_by: recipe.groupBy,
    aggregates: recipe.aggregates,
    percentage: recipe.percentage,
    sort: recipe.sort,
    limit: recipe.limit,
  };
}

export function roundRows(rows: Record<string, unknown>[], decimals: number | null): Record<string, unknown>[] {
  if (decimals === null) {
    return rows;
  }
  const factor = 10 ** decimals;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = typeof value === 'number' ? Math.round(value * factor) / factor : value;
    }
    return out;
  });
}
