export type DatasetCell = string | number | boolean | null;
export type DatasetRow = Record<string, DatasetCell>;
export type ColumnKind = 'number' | 'date' | 'boolean' | 'text' | 'empty';

export interface ColumnProfile {
  readonly name: string;
  readonly kind: ColumnKind;
  readonly completeness: number;
  readonly distinct: number;
  readonly missing: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
}

export interface CorrelationPair {
  readonly left: string;
  readonly right: string;
  readonly coefficient: number;
  readonly samples: number;
}

export interface DatasetAnalysis {
  readonly name: string;
  readonly bytes: number;
  readonly rows: readonly DatasetRow[];
  readonly columns: readonly string[];
  readonly profiles: readonly ColumnProfile[];
  readonly correlations: readonly CorrelationPair[];
  readonly completeness: number;
  readonly duplicateRows: number;
  readonly anomalyCount: number;
  readonly numericColumns: number;
  readonly insights: readonly string[];
}

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 150;
const DATE_PATTERN = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s].*)?$/;
const NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)$/;

function uniqueHeaders(rawHeaders: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return rawHeaders.map((rawHeader, index) => {
    const base = rawHeader.trim() || `column_${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function toCell(rawValue: unknown): DatasetCell {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'object') return JSON.stringify(rawValue);
  const value = String(rawValue).trim();
  if (!value || value.toLowerCase() === 'null' || value.toLowerCase() === 'n/a') return null;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  if (NUMBER_PATTERN.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
      continue;
    }
    if (character === delimiter && !quoted) { row.push(value); value = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value); value = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    value += character;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function delimitedToRecords(text: string, delimiter: string): DatasetRow[] {
  const parsed = parseDelimitedRows(text, delimiter);
  if (parsed.length < 2) throw new Error('O arquivo precisa conter cabeçalho e pelo menos uma linha de dados.');
  const headers = uniqueHeaders(parsed[0]).slice(0, MAX_COLUMNS);
  return parsed.slice(1, MAX_ROWS + 1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, toCell(cells[index])])),
  );
}

function jsonToRecords(text: string): DatasetRow[] {
  const parsed: unknown = JSON.parse(text);
  const candidate = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object'
    ? Object.values(parsed).find((value) => Array.isArray(value)) : null;
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new Error('O JSON precisa conter uma lista de objetos ou uma propriedade com uma lista.');
  }
  const objects = candidate.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  ).slice(0, MAX_ROWS);
  const headers = [...new Set(objects.flatMap((item) => Object.keys(item)))].slice(0, MAX_COLUMNS);
  return objects.map((item) => Object.fromEntries(headers.map((header) => [header, toCell(item[header])])));
}

export function parseDatasetText(fileName: string, text: string): DatasetRow[] {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'json') return jsonToRecords(text);
  if (extension === 'tsv') return delimitedToRecords(text, '\t');
  if (extension === 'csv') {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    return delimitedToRecords(text, delimiter);
  }
  throw new Error('Formato não suportado. Use CSV, TSV ou JSON.');
}

function inferKind(values: readonly DatasetCell[]): ColumnKind {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) return 'empty';
  if (present.filter((value) => typeof value === 'number').length / present.length >= 0.8) return 'number';
  if (present.filter((value) => typeof value === 'boolean').length / present.length >= 0.8) return 'boolean';
  const dates = present.filter((value) => typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))).length;
  return dates / present.length >= 0.8 ? 'date' : 'text';
}

function pearson(left: readonly number[], right: readonly number[]): number {
  const count = Math.min(left.length, right.length);
  if (count < 3) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / count;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0; let leftVariance = 0; let rightVariance = 0;
  for (let index = 0; index < count; index += 1) {
    const leftDelta = left[index] - leftMean; const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta; leftVariance += leftDelta ** 2; rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildCorrelations(rows: readonly DatasetRow[], profiles: readonly ColumnProfile[]): CorrelationPair[] {
  const numeric = profiles.filter((profile) => profile.kind === 'number').slice(0, 12);
  const pairs: CorrelationPair[] = [];
  for (let leftIndex = 0; leftIndex < numeric.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < numeric.length; rightIndex += 1) {
      const leftValues: number[] = []; const rightValues: number[] = [];
      for (const row of rows) {
        const left = row[numeric[leftIndex].name]; const right = row[numeric[rightIndex].name];
        if (typeof left === 'number' && typeof right === 'number') { leftValues.push(left); rightValues.push(right); }
      }
      if (leftValues.length >= 3) pairs.push({ left: numeric[leftIndex].name, right: numeric[rightIndex].name, coefficient: pearson(leftValues, rightValues), samples: leftValues.length });
    }
  }
  return pairs.toSorted((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient));
}

function countAnomalies(rows: readonly DatasetRow[], profiles: readonly ColumnProfile[]): number {
  let anomalyCount = 0;
  for (const profile of profiles.filter((item) => item.kind === 'number')) {
    const values = rows.map((row) => row[profile.name]).filter((value): value is number => typeof value === 'number');
    if (values.length < 4 || profile.mean === null) continue;
    const variance = values.reduce((sum, value) => sum + (value - profile.mean!) ** 2, 0) / values.length;
    const deviation = Math.sqrt(variance);
    if (deviation > 0) anomalyCount += values.filter((value) => Math.abs((value - profile.mean!) / deviation) > 3).length;
  }
  return anomalyCount;
}

export function analyzeDataset(name: string, rows: readonly DatasetRow[], bytes = 0): DatasetAnalysis {
  if (rows.length === 0) throw new Error('Nenhuma linha válida foi encontrada.');
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, MAX_COLUMNS);
  const totalCells = rows.length * columns.length;
  let presentCells = 0;
  const profiles = columns.map((column): ColumnProfile => {
    const values = rows.map((row) => row[column] ?? null);
    const present = values.filter((value) => value !== null); presentCells += present.length;
    const kind = inferKind(values);
    const numericValues = present.filter((value): value is number => typeof value === 'number');
    return { name: column, kind, completeness: values.length ? (present.length / values.length) * 100 : 0,
      distinct: new Set(present.map(String)).size, missing: values.length - present.length,
      minimum: numericValues.length ? Math.min(...numericValues) : null,
      maximum: numericValues.length ? Math.max(...numericValues) : null,
      mean: numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : null };
  });
  const duplicateRows = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size;
  const correlations = buildCorrelations(rows, profiles);
  const anomalyCount = countAnomalies(rows, profiles);
  const completeness = totalCells ? (presentCells / totalCells) * 100 : 0;
  const strongestCorrelation = correlations[0];
  const lowestCompleteness = profiles.toSorted((left, right) => left.completeness - right.completeness)[0];
  const insights = [
    `${rows.length.toLocaleString('pt-BR')} linhas e ${columns.length} colunas foram perfiladas localmente.`,
    lowestCompleteness && lowestCompleteness.completeness < 100 ? `${lowestCompleteness.name} é a coluna com menor completude (${lowestCompleteness.completeness.toFixed(1)}%).` : 'Todas as colunas estão completas no recorte analisado.',
    duplicateRows ? `${duplicateRows.toLocaleString('pt-BR')} linhas duplicadas precisam de decisão antes da modelagem.` : 'Nenhuma linha integralmente duplicada foi encontrada.',
    strongestCorrelation ? `A associação linear mais forte é ${strongestCorrelation.left} × ${strongestCorrelation.right} (${strongestCorrelation.coefficient.toFixed(2)}).` : 'Não há pares numéricos suficientes para uma análise de correlação.',
    anomalyCount ? `${anomalyCount.toLocaleString('pt-BR')} valores ultrapassam três desvios-padrão.` : 'O scanner estatístico não encontrou valores acima de três desvios-padrão.',
  ];
  return { name, bytes, rows, columns, profiles, correlations, completeness, duplicateRows, anomalyCount,
    numericColumns: profiles.filter((profile) => profile.kind === 'number').length, insights };
}

export function datasetToCsv(dataset: DatasetAnalysis): string {
  const escape = (value: DatasetCell) => { if (value === null) return ''; const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return [dataset.columns.map(escape).join(','), ...dataset.rows.map((row) => dataset.columns.map((column) => escape(row[column] ?? null)).join(','))].join('\n');
}

export const SAMPLE_DATASET: readonly DatasetRow[] = [
  { month: '2026-01-01', region: 'Sudeste', revenue: 184000, cost: 121000, customers: 940, churn: 3.2 },
  { month: '2026-02-01', region: 'Sudeste', revenue: 197000, cost: 126000, customers: 1015, churn: 3.0 },
  { month: '2026-03-01', region: 'Sudeste', revenue: 215000, cost: 132000, customers: 1088, churn: 2.7 },
  { month: '2026-01-01', region: 'Sul', revenue: 128000, cost: 91000, customers: 670, churn: 4.1 },
  { month: '2026-02-01', region: 'Sul', revenue: 136000, cost: 93000, customers: 701, churn: 3.8 },
  { month: '2026-03-01', region: 'Sul', revenue: 149000, cost: 97000, customers: 756, churn: 3.4 },
  { month: '2026-01-01', region: 'Nordeste', revenue: 96000, cost: 74000, customers: 520, churn: 5.2 },
  { month: '2026-02-01', region: 'Nordeste', revenue: 103000, cost: 76000, customers: 557, churn: 4.8 },
  { month: '2026-03-01', region: 'Nordeste', revenue: 118000, cost: 81000, customers: 620, churn: 4.2 },
  { month: '2026-01-01', region: 'Centro-Oeste', revenue: 82000, cost: 61000, customers: 410, churn: 4.7 },
  { month: '2026-02-01', region: 'Centro-Oeste', revenue: 89000, cost: 64000, customers: 446, churn: null },
  { month: '2026-03-01', region: 'Centro-Oeste', revenue: 101000, cost: 69000, customers: 495, churn: 4.0 },
] as const;
