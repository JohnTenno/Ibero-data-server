import {
  buildDatasetView,
  buildSurveyView,
  type DatasetEdition,
} from './harmonized-view.js';

function edition(
  partial: Partial<DatasetEdition> & Pick<DatasetEdition, 'columns' | 'rows'>,
): DatasetEdition {
  return {
    name: partial.name ?? 'ds',
    year: partial.year ?? 2020,
    columns: partial.columns,
    columnToCanonical: partial.columnToCanonical ?? new Map(),
    rows: partial.rows,
  };
}

describe('harmonizer: buildDatasetView', () => {
  it('sin mapeos devuelve headers y rows vacíos', () => {
    const view = buildDatasetView(
      edition({ columns: ['a'], rows: [{ a: '1' }] }),
    );
    expect(view).toEqual({ headers: [], rows: [] });
  });

  it('proyecta solo columnas mapeadas, renombradas, en el orden del CSV', () => {
    const view = buildDatasetView(
      edition({
        columns: ['folio', 'age', 'sexo', 'extra'],
        columnToCanonical: new Map([
          ['sexo', 'sexo'],
          ['age', 'edad'],
        ]),
        rows: [
          { folio: '1', age: '30', sexo: 'M', extra: 'x' },
          { folio: '2', age: '', sexo: 'F', extra: 'y' },
        ],
      }),
    );
    expect(view.headers).toEqual(['edad', 'sexo']);
    expect(view.rows).toEqual([
      { edad: '30', sexo: 'M' },
      { edad: '', sexo: 'F' },
    ]);
  });

  it('dos columnas a la misma canónica: un solo header y en la fila gana la última', () => {
    const view = buildDatasetView(
      edition({
        columns: ['edad_a', 'edad_b'],
        columnToCanonical: new Map([
          ['edad_a', 'edad'],
          ['edad_b', 'edad'],
        ]),
        rows: [{ edad_a: '1', edad_b: '2' }],
      }),
    );
    expect(view.headers).toEqual(['edad']);
    expect(view.rows).toEqual([{ edad: '2' }]);
  });
});

describe('harmonizer: buildSurveyView', () => {
  const editions: DatasetEdition[] = [
    edition({
      name: 'ENIGH 2020',
      year: 2020,
      columns: ['age', 'sexo'],
      columnToCanonical: new Map([
        ['age', 'edad'],
        ['sexo', 'sexo'],
      ]),
      rows: [{ age: '30', sexo: 'M' }],
    }),
    edition({
      name: 'ENIGH 2021',
      year: 2021,
      columns: ['edad1'],
      columnToCanonical: new Map([['edad1', 'edad']]),
      rows: [{ edad1: '41' }],
    }),
  ];

  it('une ediciones y antepone _dataset/_year', () => {
    const view = buildSurveyView(editions, ['edad', 'sexo']);
    expect(view.headers).toEqual(['edad', 'sexo']);
    expect(view.rows).toEqual([
      { edad: '30', sexo: 'M', _dataset: 'ENIGH 2020', _year: 2020 },
      { edad: '41', _dataset: 'ENIGH 2021', _year: 2021 },
    ]);
  });

  it('una fila que no aporta ninguna variable pedida se omite', () => {
    const view = buildSurveyView(editions, ['sexo']);
    expect(view.rows).toEqual([
      { sexo: 'M', _dataset: 'ENIGH 2020', _year: 2020 },
    ]);
  });

  it('headers devuelve wanted tal cual aunque no exista en ningún dataset', () => {
    const view = buildSurveyView(editions, ['edad', 'inexistente']);
    expect(view.headers).toEqual(['edad', 'inexistente']);
    expect(view.rows.every((r) => !('inexistente' in r))).toBe(true);
  });

  it('wanted vacío -> vista vacía', () => {
    expect(buildSurveyView(editions, [])).toEqual({ headers: [], rows: [] });
  });
});
