import type { AssetEntry } from '@qa3elhamor/world-domain';
import type { Vec3 } from './landmarks.js';

export interface ReportRow {
  readonly entry: AssetEntry;
  readonly sourceModelBytes: number;
  readonly outputBytes: number;
  readonly trianglesBefore: number;
  readonly trianglesAfter: number;
  readonly offset: Vec3 | null;
}

const START = '<!-- asset-table:start -->';
const END = '<!-- asset-table:end -->';

const kib = (n: number): string => `${(n / 1024).toFixed(1)} KiB`;
const count = (n: number): string => n.toLocaleString('en-US');

export function renderTable(rows: readonly ReportRow[]): string {
  const lines = [
    '| Asset | Source model (dir bytes) | Output | Budget | % of budget | Tris before | Tris after | Load |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const r of rows) {
    const pct = ((r.outputBytes / r.entry.budgetBytes) * 100).toFixed(1);
    lines.push(
      `| \`${r.entry.id}\` | ${r.entry.sourceModel} (${kib(r.sourceModelBytes)}) | ${kib(r.outputBytes)} | ` +
        `${kib(r.entry.budgetBytes)} | ${pct}% | ${count(r.trianglesBefore)} | ${count(r.trianglesAfter)} | ` +
        `${r.entry.lazy ? 'lazy' : 'initial'} |`,
    );
  }
  const sum = (lazy: boolean): number =>
    rows.filter((r) => r.entry.lazy === lazy).reduce((a, r) => a + r.outputBytes, 0);
  const budget = (lazy: boolean): number =>
    rows.filter((r) => r.entry.lazy === lazy).reduce((a, r) => a + r.entry.budgetBytes, 0);
  lines.push(
    '',
    '| Group | Output | Budgets summed |',
    '|---|---:|---:|',
    `| Initial load (non-lazy) | ${kib(sum(false))} | ${kib(budget(false))} |`,
    `| Lazy | ${kib(sum(true))} | ${kib(budget(true))} |`,
    `| Everything | ${kib(sum(false) + sum(true))} | ${kib(budget(false) + budget(true))} |`,
  );
  return lines.join('\n');
}

/** Returns the report with the generated table replaced; the prose around it is hand-written. */
export function renderReport(existing: string | null, rows: readonly ReportRow[]): string {
  if (!existing || !existing.includes(START) || !existing.includes(END)) {
    throw new Error(`Report is missing or has no ${START} ... ${END} markers.`);
  }
  const head = existing.slice(0, existing.indexOf(START) + START.length);
  const tail = existing.slice(existing.indexOf(END));
  return `${head}\n${renderTable(rows)}\n${tail}`;
}
