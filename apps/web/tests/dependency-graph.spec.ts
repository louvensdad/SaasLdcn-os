import { expect, test, type Page } from '@playwright/test';
import { webUrl } from './test-urls';

const WIZARD_URL = webUrl('/wizard');

test.setTimeout(60_000);

async function completeSelection(page: Page, options: {
  readonly languageId: string;
  readonly runtimeId: string;
  readonly frameworkId: string;
  readonly architectureId: string;
  readonly archetypeId: string;
  readonly capabilityLabels: readonly string[];
  readonly moduleLabel: string;
}) {
  page.on('pageerror', (error) => {
    console.log(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`console-error: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() === 404) {
      console.log(`response-404: ${response.url()}`);
    }
  });
  await page.goto(WIZARD_URL);
  await page.getByRole('button', { name: '1 Technology Path Choose language, runtime, and framework.' }).click();
  await page.getByLabel('1. Language').selectOption(options.languageId);
  await page.getByLabel('2. Runtime').selectOption(options.runtimeId);
  await page.getByLabel('3. Framework').selectOption(options.frameworkId);
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();
  await page.getByLabel('4. Architecture').selectOption(options.architectureId);
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();
  await page.getByLabel('5. Archetype').selectOption(options.archetypeId);
  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();
  await page.getByRole('button', { name: 'View advanced capabilities' }).click();
  for (const capabilityLabel of options.capabilityLabels) {
    const checkbox = page.getByRole('checkbox', { name: capabilityLabel });
    if ((await checkbox.count()) > 0) {
      await checkbox.check();
    }
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('checkbox', { name: options.moduleLabel }).check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible({ timeout: 15000 });
}

test('wizard shows dependency propagation for microservices', async ({ page }) => {
  await completeSelection(page, {
    languageId: 'java',
    runtimeId: 'jvm',
    frameworkId: 'spring_boot',
    architectureId: 'microservices',
    archetypeId: 'microservice_api',
    capabilityLabels: ['Observability', 'Queue'],
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Dependency graph', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Propagation and impact surface')).toBeVisible();
  await expect(page.getByText('Microservices increase deployment coordination and operational burden.').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Required observability', { exact: false })).toBeVisible({ timeout: 15000 });
});

test('wizard shows vector database mutation for AI RAG', async ({ page }) => {
  await completeSelection(page, {
    languageId: 'python',
    runtimeId: 'python_runtime',
    frameworkId: 'fastapi',
    architectureId: 'clean_architecture',
    archetypeId: 'ai_saas',
    capabilityLabels: ['AI Chat', 'RAG'],
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Dependency graph', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('AI chat mutates infrastructure toward vector search support.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Required vector_database', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Readiness radar')).toBeVisible();
});

test('wizard keeps dependency graph safe when backend is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/dependency-graph/**', async (route) => {
    await route.abort('failed');
  });

  await completeSelection(page, {
    languageId: 'java',
    runtimeId: 'jvm',
    frameworkId: 'spring_boot',
    architectureId: 'microservices',
    archetypeId: 'microservice_api',
    capabilityLabels: ['Observability', 'Queue'],
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Dependency graph services are offline, but the wizard keeps the current selection safe.')).toBeVisible({ timeout: 15000 });
});
