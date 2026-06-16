import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['app', 'components'];
const checkedAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title']);
const findings = [];
const fileArgumentIndex = process.argv.indexOf('--file');
const fileFilter = fileArgumentIndex >= 0 ? process.argv[fileArgumentIndex + 1]?.replaceAll('\\', '/') : null;

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(target);
    return entry.isFile() && target.endsWith('.tsx') ? [target] : [];
  });
}

function hasHumanText(value) {
  return /[A-Za-zÀ-ÿ]{2}/u.test(value);
}

function addFinding(sourceFile, node, kind, value) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    file: path.relative(process.cwd(), sourceFile.fileName).replaceAll('\\', '/'),
    line: position.line + 1,
    kind,
    text: value.replace(/\s+/g, ' ').trim(),
  });
}

function inspectExpression(sourceFile, expression) {
  if (!expression) return;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    if (hasHumanText(expression.text)) addFinding(sourceFile, expression, 'jsx-expression', expression.text);
    return;
  }
  if (ts.isConditionalExpression(expression)) {
    inspectExpression(sourceFile, expression.whenTrue);
    inspectExpression(sourceFile, expression.whenFalse);
  }
}

function inspectFile(fileName) {
  const source = fs.readFileSync(fileName, 'utf8');
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxText(node) && hasHumanText(node.text)) {
      addFinding(sourceFile, node, 'jsx-text', node.text);
    } else if (
      ts.isJsxAttribute(node)
      && checkedAttributes.has(node.name.getText(sourceFile))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && hasHumanText(node.initializer.text)
    ) {
      addFinding(sourceFile, node, `attribute:${node.name.getText(sourceFile)}`, node.initializer.text);
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      inspectExpression(sourceFile, node.expression);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

for (const root of roots) {
  for (const fileName of collectFiles(path.resolve(root))) {
    const relativeFile = path.relative(process.cwd(), fileName).replaceAll('\\', '/');
    if (!fileFilter || relativeFile === fileFilter) inspectFile(fileName);
  }
}

const byFile = new Map();
for (const finding of findings) {
  const items = byFile.get(finding.file) ?? [];
  items.push(finding);
  byFile.set(finding.file, items);
}

console.log(`Hardcoded i18n audit: ${findings.length} finding(s) in ${byFile.size} file(s).`);
for (const [file, items] of [...byFile.entries()].sort((left, right) => right[1].length - left[1].length)) {
  console.log(`${String(items.length).padStart(4)}  ${file}`);
  if (process.argv.includes('--verbose')) {
    for (const item of items) console.log(`      ${item.line}: ${item.text}`);
  }
}

if (process.argv.includes('--check') && findings.length > 0) process.exitCode = 1;
