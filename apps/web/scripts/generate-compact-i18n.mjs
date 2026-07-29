import fs from 'node:fs';
import path from 'node:path';

const locales = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'];
const sourceDirectory = path.resolve('lib/i18n/dictionaries');
const outputFile = path.resolve('lib/i18n/compact.generated.json');
const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(sourceDirectory, `${locale}.json`), 'utf8')),
  ]),
);
const keys = Object.keys(dictionaries['pt-BR']);

for (const locale of locales) {
  const dictionaryKeys = Object.keys(dictionaries[locale]);
  const missing = keys.filter((key) => !(key in dictionaries[locale]));
  const extra = dictionaryKeys.filter((key) => !(key in dictionaries['pt-BR']));
  if (missing.length || extra.length) {
    throw new Error(`${locale} cannot be compacted: ${missing.length} missing, ${extra.length} extra keys.`);
  }
}

const compact = JSON.stringify({
  keys,
  locales: Object.fromEntries(
    locales.map((locale) => [locale, keys.map((key) => dictionaries[locale][key])]),
  ),
});
const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : null;
if (current !== compact) fs.writeFileSync(outputFile, compact, 'utf8');

console.log(`Compact i18n generated: ${keys.length} keys x ${locales.length} locales (${Buffer.byteLength(compact)} bytes).`);
