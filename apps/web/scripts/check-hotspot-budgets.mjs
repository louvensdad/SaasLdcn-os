import fs from 'node:fs';

const budgets = {
  'app/(app)/wizard/page.tsx': 3793,
  '../api/app/services/framework_specialist_service.py': 2163,
  '../api/app/engines/generation_job_engine.py': 1682,
  '../api/app/routes/meta_factory.py': 1475,
  '../api/app/services/build_validation_service.py': 1138,
  '../api/app/engines/llm/mock_adapter.py': 1171,
  'app/(app)/meta-factory/page.tsx': 1138,
};
const failures = [];
for (const [file, maximum] of Object.entries(budgets)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
  console.log(`Hotspot ${file}: ${lines}/${maximum} lines`);
  if (lines > maximum) failures.push(`${file}: ${lines} > ${maximum}`);
}
if (failures.length) {
  console.error(`Hotspot budget exceeded:\n${failures.join('\n')}`);
  process.exit(1);
}