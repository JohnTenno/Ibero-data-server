export type RawData = Record<string, string>;
export type HarmonizedRow = Record<string, string | number>;

export interface HarmonizedView {
  headers: string[];
  rows: HarmonizedRow[];
}

export interface DatasetEdition {
  name: string;
  year: number;
  columns: string[];
  columnToCanonical: Map<string, string>;
  rows: RawData[];
}

export function buildDatasetView(edition: DatasetEdition): HarmonizedView {
  if (edition.columnToCanonical.size === 0) {
    return { headers: [], rows: [] };
  }

  const headers: string[] = [];
  for (const col of edition.columns) {
    const canon = edition.columnToCanonical.get(col);
    if (canon && !headers.includes(canon)) headers.push(canon);
  }

  const rows = edition.rows.map((raw) => {
    const row: HarmonizedRow = {};
    for (const col of edition.columns) {
      const canon = edition.columnToCanonical.get(col);
      if (canon) row[canon] = raw[col] ?? '';
    }
    return row;
  });

  return { headers, rows };
}

export function buildSurveyView(
  editions: DatasetEdition[],
  wanted: string[],
): HarmonizedView {
  if (wanted.length === 0) {
    return { headers: [], rows: [] };
  }

  const rows: HarmonizedRow[] = [];
  for (const edition of editions) {
    const view = buildDatasetView(edition);
    const present = new Set(view.headers);
    for (const r of view.rows) {
      const row: HarmonizedRow = {};
      for (const h of wanted) {
        if (present.has(h)) row[h] = r[h] ?? '';
      }
      if (Object.keys(row).length === 0) continue;
      row['_dataset'] = edition.name;
      row['_year'] = edition.year;
      rows.push(row);
    }
  }

  return { headers: wanted, rows };
}
