import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceRecorder } from './evidence';
import { assertNoSecrets } from './redact';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-flight gate (plan Phase 3, items 1/5/6): confirm the live site is
// reachable, the harness can capture evidence end-to-end on a harmless page,
// and redaction leaves no secret-shaped content behind -- before any step
// that spends real LLM cost runs.
test('pre-flight: site reachable, evidence capture + redaction work end-to-end', async ({ page }) => {
  const evidence = new EvidenceRecorder('_preflight');
  evidence.attach(page);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login/);
  await evidence.screenshot(page, 'login-page-reachable');

  evidence.step({ step: 'preflight.reach-login', state: 'Criado', note: 'Live site reachable, login page rendered.' });
  evidence.finalize();

  const dir = path.join(__dirname, 'evidence', '_preflight');
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.log') || file.endsWith('.json')) {
      assertNoSecrets(fs.readFileSync(path.join(dir, file), 'utf-8'));
    }
  }
});
