import { BadRequestException } from '@nestjs/common';
export const ALLOWED_AGG_FUNCS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'MEDIAN']);
export const ALLOWED_OPERATORS = new Set(['=', '!=', '<', '<=', '>', '>=']);
export const ALLOWED_SORT_DIRS = new Set(['asc', 'desc']);
export const ALLOWED_JOIN_TYPES = new Set(['inner', 'left']);
export const OP_CATALOG = {
  join: {
    kind: 'join',
    description:
      'Cruza este dataset con otro resource por una columna en común (ej: hogares + personas por folio). El otro resource debe ser del mismo dataset.',
    params: ['resourceId', 'alias', 'type', 'onLeft', 'onRight'],
  },
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

export interface JoinSpec {
  resourceId: string;
  alias: string;
  type: string;
  onLeft: string;
  onRight: string;
}

export interface Recipe {
  joins: JoinSpec[];
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
function requireField(value: unknown, message: string): string {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (s === '') {
    throw new BadRequestException(message);
  }
  return s;
}

function requireOperand(value: unknown, message: string): string | number {
  if (typeof value === 'number') {
    return value;
  }
  return requireField(value, message);
}

export function stepsToInternal(steps: Step[]): Recipe {
  const recipe: Recipe = {
    joins: [],
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
      case 'join':
        recipe.joins.push({
          resourceId: requireField(p.resourceId, 'Falta elegir el recurso a cruzar en el paso "Cruzar con otro recurso".'),
          alias: requireField(p.alias, 'Falta el alias del recurso cruzado en el paso "Cruzar con otro recurso".'),
          type: requireField(p.type, 'Falta el tipo de cruce (inner/left) en el paso "Cruzar con otro recurso".'),
          onLeft: requireField(p.onLeft, 'Falta la columna de este recurso en el paso "Cruzar con otro recurso".'),
          onRight: requireField(p.onRight, 'Falta la columna del recurso cruzado en el paso "Cruzar con otro recurso".'),
        });
        break;
      case 'group_by': {
        const columns = Array.isArray(p.columns)
          ? (p.columns as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim() !== '')
          : [];
        if (columns.length === 0) {
          throw new BadRequestException('El paso "Agrupar por" necesita al menos una columna seleccionada.');
        }
        recipe.groupBy = columns;
        break;
      }
      case 'aggregate':
        recipe.aggregates.push({
          func: requireField(p.func, 'Falta la función en el paso "Calcular".'),
          column: requireField(p.column, 'Falta la columna en el paso "Calcular".'),
          as: requireField(p.as, 'Falta el nombre del resultado en el paso "Calcular".'),
          distinct: Boolean(p.distinct),
        });
        break;
      case 'compute':
        recipe.computes.push({
          left: requireOperand(p.left, 'Falta la columna A en el paso "Crear columna".'),
          right: requireOperand(p.right, 'Falta la columna B (o número) en el paso "Crear columna".'),
          as: requireField(p.as, 'Falta el nombre del resultado en el paso "Crear columna".'),
        });
        break;
      case 'filter':
        recipe.filters.push({
          column: requireField(p.column, 'Falta la columna en el paso "Filtrar filas".'),
          operator: requireField(p.operator, 'Falta el operador en el paso "Filtrar filas".'),
          value: p.value as string | number,
        });
        break;
      case 'percentage':
        recipe.percentage = {
          of: requireField(p.of, 'Falta elegir el agregado de referencia en el paso "Convertir a porcentaje".'),
          as: requireField(p.as, 'Falta el nombre del resultado en el paso "Convertir a porcentaje".'),
        };
        break;
      case 'sort':
        recipe.sort.push({
          column: requireField(p.column, 'Falta la columna en el paso "Ordenar".'),
          dir: requireField(p.dir, 'Falta la dirección en el paso "Ordenar".'),
        });
        break;
      case 'limit': {
        if (p.n === undefined || p.n === null || String(p.n).trim() === '') {
          throw new BadRequestException('Falta el número de filas en el paso "Limitar filas".');
        }
        const n = Number(p.n);
        if (!Number.isFinite(n) || n <= 0) {
          throw new BadRequestException('El número de filas en "Limitar filas" debe ser mayor a 0.');
        }
        recipe.limit = n;
        break;
      }
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
  for (const j of recipe.joins) {
    if (!ALLOWED_JOIN_TYPES.has(j.type)) {
      throw new BadRequestException(`Tipo de join no permitido: ${j.type}`);
    }
    const alias = quoteIdent(j.alias);
    fromClause += ` ${j.type.toUpperCase()} JOIN ${alias} ON data.${quoteIdent(j.onLeft)} = ${alias}.${quoteIdent(j.onRight)}`;
  }

  if (recipe.computes.length > 0) {
    const parts = recipe.computes.map((c) => {
      const left = computeOperand(c.left);
      const right = computeOperand(c.right);
      return `(${left} * ${right}) AS ${quoteIdent(c.as)}`;
    });
    fromClause = `(SELECT *, ${parts.join(', ')} FROM ${fromClause}) AS data`;
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
    joins: recipe.joins,
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
