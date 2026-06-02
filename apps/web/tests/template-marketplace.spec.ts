import { expect, test, type Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8001/api';
const TEMPLATES_URL = 'http://127.0.0.1:3000/templates';

function catalogFixture() {
  return {
    contractVersion: '1.0.0',
    templates: [
      {
        contractVersion: '1.0.0',
        id: 'landing-page',
        name: 'Next.js Static Landing',
        description: 'Premium landing page for product launches.',
        version: '1.0.0',
        category: 'marketing',
        supported_languages: ['typescript'],
        supported_frameworks: ['nextjs'],
        supported_architectures: ['modular_monolith'],
        supported_archetypes: ['landing_page'],
        capabilities: ['seo', 'analytics'],
        complexity: 'medium',
        maturity: 'stable',
        preview_images: ['/templates/landing-page/preview.png'],
        tags: ['landing', 'seo'],
        changelog: [
          {
            contractVersion: '1.0.0',
            version: '1.0.0',
            date: '2026-06-02',
            changes: ['Initial local marketplace metadata'],
          },
        ],
      },
      {
        contractVersion: '1.0.0',
        id: 'docs-site',
        name: 'Documentation Site',
        description: 'Static documentation foundation.',
        version: '1.2.0',
        category: 'documentation',
        supported_languages: ['html', 'javascript'],
        supported_frameworks: ['vanilla', 'static_site'],
        supported_architectures: ['static'],
        supported_archetypes: ['documentation_site'],
        capabilities: ['docs', 'search'],
        complexity: 'low',
        maturity: 'mature',
        preview_images: ['/templates/docs-site/preview.png'],
        tags: ['docs', 'static'],
        changelog: [
          {
            contractVersion: '1.0.0',
            version: '1.2.0',
            date: '2026-06-02',
            changes: ['Expanded documentation metadata'],
          },
        ],
      },
    ],
    categories: ['documentation', 'marketing'],
    total: 2,
  };
}

async function mockCatalog(page: Page) {
  await page.route(`${API_BASE}/templates/catalog`, async (route) => route.fulfill({ json: catalogFixture() }));
}

test('templates page renders local marketplace cards and details', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(TEMPLATES_URL);

  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByText('Next.js Static Landing')).toBeVisible();
  await expect(page.getByText('Documentation Site')).toBeVisible();
  await expect(page.getByText('Template compatibility validated')).toBeVisible();
  await expect(page.getByText('Template maturity verified')).toBeVisible();
  await expect(page.getByText('Initial local marketplace metadata')).toBeVisible();
});

test('templates search filters by framework, tag, and name', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(TEMPLATES_URL);

  await page.getByLabel('Search templates').fill('nextjs');
  await expect(page.getByText('Next.js Static Landing')).toBeVisible();
  await expect(page.getByText('Documentation Site')).toHaveCount(0);

  await page.getByLabel('Search templates').fill('docs');
  await expect(page.getByText('Documentation Site')).toBeVisible();
  await expect(page.getByText('Next.js Static Landing')).toHaveCount(0);
});

test('templates category and complexity filters hide incompatible cards', async ({ page }) => {
  await mockCatalog(page);
  await page.goto(TEMPLATES_URL);

  await page.getByLabel('Filter templates by category').selectOption('documentation');
  await expect(page.getByText('Documentation Site')).toBeVisible();
  await expect(page.getByText('Next.js Static Landing')).toHaveCount(0);

  await page.getByLabel('Filter templates by complexity').selectOption('medium');
  await expect(page.getByText('No templates match these filters.')).toBeVisible();
});

test('templates page has safe offline state', async ({ page }) => {
  await page.route(`${API_BASE}/templates/catalog`, async (route) => route.abort('failed'));
  await page.goto(TEMPLATES_URL);

  await expect(page.getByText('Template catalog unavailable')).toBeVisible();
});
