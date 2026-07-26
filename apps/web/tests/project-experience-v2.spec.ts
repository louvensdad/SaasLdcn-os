import { expect, test } from '@playwright/test';

import { projectFixture, setup } from './project-experience-fixtures';
import { webUrl } from './test-urls';

test('Project Experience V2 presents a cinematic project journey from real data', async ({ page }) => {
  await setup(page);
  await page.goto(webUrl('/projects/project_v2'));

  await expect(page.getByRole('heading', { name: 'Clinic Command Center' })).toBeVisible();
  await expect(page.getByText('Saúde / Operação Clínica')).toBeVisible();
  await expect(page.getByText('Live Project Preview')).toBeVisible();
  await expect(page.getByText('Technology Verified')).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
  await expect(page.getByText('Architecture Experience')).toBeVisible();
  await page.getByRole('button', { name: /Backend/ }).click();
  await expect(page.getByText('No selecionado')).toBeVisible();
  await expect(page.getByText('Engineering Dashboard')).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir Laboratorio/ }).first()).toHaveAttribute('href', '/engineering-laboratory?projectId=project_v2');
  await expect(page.getByText('Deploy Center')).toBeVisible();
  await expect(page.getByText('GitHub', { exact: true })).toBeVisible();
  await expect(page.getByText('Documentation')).toBeVisible();
  await expect(page.getByText('README.md').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
});

test('Project Experience V2 remains usable on mobile', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webUrl('/projects/project_v2'));

  await expect(page.getByRole('heading', { name: 'Clinic Command Center' })).toBeVisible();
  await page.getByRole('button', { name: 'Mobile' }).click();
  await expect(page.getByText('app/page.tsx').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir Laboratorio/ }).first()).toBeVisible();
});

test('project deletion requires confirmation and redirects only after success', async ({ page }) => {
  await setup(page);
  let deleteRequests = 0;

  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'DELETE' && pathname.endsWith('/projects/project_v2')) {
      deleteRequests += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (pathname.endsWith('/projects/project_v2')) {
      await route.fulfill({ json: projectFixture() });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto(webUrl('/projects/project_v2'));
  const deleteButton = page.getByRole('button', { name: 'Excluir projeto' });
  await deleteButton.click();
  await expect(page.getByRole('alertdialog')).toContainText('Clinic Command Center');

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  expect(deleteRequests).toBe(0);

  await deleteButton.click();
  await page.getByRole('button', { name: 'Excluir permanentemente' }).click();

  await expect.poll(() => deleteRequests).toBe(1);
  await expect(page).toHaveURL(/\/projects$/);
});

test('project registry removes a project after confirmed deletion', async ({ page }) => {
  await setup(page);
  let projects = [projectFixture()];

  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      projects = [];
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: projects });
  });

  await page.goto(webUrl('/projects'));
  await expect(page.getByText('Clinic Command Center').first()).toBeVisible();
  await page.getByRole('button', { name: 'Excluir projeto' }).click();
  await page.getByRole('button', { name: 'Excluir permanentemente' }).click();

  await expect(page.getByText('Clinic Command Center')).toHaveCount(0);
});
