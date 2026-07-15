/**
 * Typography / Design-System audit.
 *
 * Flags places that bypass the LDCN Engineering Design System:
 *  - inline font-size (style={{ fontSize }})
 *  - arbitrary pixel text sizes (text-[13px], text-[0.8rem])
 *  - hardcoded grey text colours (text-gray-*, text-slate-*, text-zinc-*, #hex greys)
 *  - the legacy overlapping scales (.t-* and .type-*) that the .ds-* scale replaces
 *
 * Usage:
 *   node scripts/audit-typography.mjs            # human summary
 *   node scripts/audit-typography.mjs --json     # machine output
 *   node scripts/audit-typography.mjs --report   # write reports/typography_audit.md
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components'];
const SELF = 'scripts/audit-typography.mjs';

const RULES = [
  { id: 'inline-font-size', re: /style=\{\{[^}]*fontSize/g, hint: 'inline fontSize — use a .ds-* class / Engineering* component' },
  { id: 'arbitrary-text-size', re: /text-\[(?:\d|\.)+(?:px|rem|em)\]/g, hint: 'arbitrary text size — use the .ds-* scale' },
  { id: 'hardcoded-grey', re: /text-(?:gray|slate|zinc|neutral|stone)-\d{2,3}/g, hint: 'hardcoded grey — use ds-text-secondary/muted' },
  { id: 'legacy-scale', re: /\b(?:t-h1|t-h2|t-h3|t-body|t-caption|type-page|type-section|type-card|type-body|type-caption|type-label)\b/g, hint: 'legacy scale — migrate to .ds-* / Engineering*' },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name) ? [target] : [];
  });
}

const files = ROOTS.flatMap((root) => (fs.existsSync(root) ? walk(root) : []))
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f !== SELF && !f.endsWith('/ds.tsx') && !f.endsWith('globals.css'));

const findings = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of RULES) {
    const matches = text.match(rule.re);
    if (matches) findings.push({ file, rule: rule.id, count: matches.length, hint: rule.hint });
  }
}

const byRule = {};
const byFile = {};
for (const f of findings) {
  byRule[f.rule] = (byRule[f.rule] ?? 0) + f.count;
  byFile[f.file] = (byFile[f.file] ?? 0) + f.count;
}
const total = Object.values(byRule).reduce((a, b) => a + b, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total, byRule, findings }, null, 2));
} else if (process.argv.includes('--report')) {
  const lines = [
    '# Typography Design-System Audit',
    '',
    `Generated: ${new Date().toISOString().slice(0, 10)} · scanned ${files.length} files.`,
    '',
    `**Total Design-System violations: ${total}**`,
    '',
    '## By rule',
    '',
    '| Rule | Count | Meaning |',
    '|------|-------|---------|',
    ...RULES.map((r) => `| \`${r.id}\` | ${byRule[r.id] ?? 0} | ${r.hint} |`),
    '',
    '## Top 25 files',
    '',
    '| File | Violations |',
    '|------|-----------|',
    ...Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, c]) => `| ${f} | ${c} |`),
    '',
  ];
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/typography_audit.md', lines.join('\n'));
  console.log(`Wrote reports/typography_audit.md (${total} violations across ${Object.keys(byFile).length} files).`);
} else {
  console.log(`Typography audit: ${total} violation(s) in ${Object.keys(byFile).length} file(s).`);
  for (const r of RULES) console.log(`  ${String(byRule[r.id] ?? 0).padStart(5)}  ${r.id}`);
}

if (process.argv.includes('--check') && total > 0) process.exitCode = 1;
