import fs from 'node:fs';
import path from 'node:path';

const directory = 'lib/i18n/dictionaries';
const locales = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'];
const dictionaries = Object.fromEntries(locales.map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(directory, `${locale}.json`), 'utf8')),
]));
const reference = dictionaries['pt-BR'];
const referenceKeys = Object.keys(reference).sort();
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;
const placeholders = (value) => [...String(value).matchAll(placeholderPattern)].map((match) => match[1]).sort();
const failures = [];
const missingBaseline = { 'en-US': 318, 'es-ES': 318, 'fr-FR': 318 };

for (const locale of locales.slice(1)) {
  const keys = Object.keys(dictionaries[locale]).sort();
  const missing = referenceKeys.filter((key) => !(key in dictionaries[locale]));
  const extra = keys.filter((key) => !(key in reference));
  if (missing.length > missingBaseline[locale]) {
    failures.push(`${locale}: missing=${missing.length}, baseline=${missingBaseline[locale]}`);
  }
  if (extra.length) failures.push(`${locale}: unexpected keys=${extra.join(',')}`);
  for (const key of referenceKeys) {
    if (key in dictionaries[locale] && placeholders(reference[key]).join('|') !== placeholders(dictionaries[locale][key]).join('|')) {
      failures.push(`${locale}:${key}: placeholder mismatch`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
const summary = locales.slice(1).map((locale) => {
  const missing = referenceKeys.filter((key) => !(key in dictionaries[locale])).length;
  return `${locale}=${missing}/${missingBaseline[locale]} missing`;
}).join(', ');
console.log(`Locale parity gate OK: ${referenceKeys.length} reference keys; ${summary}.`);