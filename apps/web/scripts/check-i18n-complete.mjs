import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const locales = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'];
const directory = 'lib/i18n/dictionaries';
const dictionaries = Object.fromEntries(locales.map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(directory, `${locale}.json`), 'utf8')),
]));
const referenceKeys = Object.keys(dictionaries['pt-BR']).sort();
const placeholderPattern = /\{\{([A-Za-z0-9_]+)\}\}/g;
const placeholders = (value) => [...String(value).matchAll(placeholderPattern)].map((match) => match[1]).sort().join('|');
const failures = [];

for (const locale of locales.slice(1)) {
  const dictionary = dictionaries[locale];
  const missing = referenceKeys.filter((key) => !(key in dictionary));
  const extra = Object.keys(dictionary).filter((key) => !(key in dictionaries['pt-BR']));
  if (missing.length) failures.push(`${locale}: ${missing.length} missing key(s): ${missing.slice(0, 20).join(', ')}`);
  if (extra.length) failures.push(`${locale}: ${extra.length} unexpected key(s): ${extra.slice(0, 20).join(', ')}`);
  for (const key of referenceKeys) {
    if (key in dictionary && placeholders(dictionary[key]) !== placeholders(dictionaries['pt-BR'][key])) {
      failures.push(`${locale}:${key}: placeholder mismatch`);
    }
  }
}

const audit = spawnSync(process.execPath, ['scripts/audit-hardcoded-i18n.mjs', '--json'], { encoding: 'utf8' });
if (audit.status !== 0) failures.push(`hardcoded audit failed to execute: ${audit.stderr.trim()}`);
else {
  const payload = JSON.parse(audit.stdout);
  if (payload.total > 0) failures.push(`frontend: ${payload.total} hardcoded human-text occurrence(s) across ${Object.keys(payload.byFile).length} file(s)`);
}

if (failures.length) {
  console.error(`i18n completeness gate FAILED\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`i18n completeness gate OK: ${referenceKeys.length} keys × ${locales.length} locales; zero hardcoded UI strings.`);
