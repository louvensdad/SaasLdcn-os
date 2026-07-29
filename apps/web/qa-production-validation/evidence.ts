import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { redactBody, redactHeaders, redactText } from './redact';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface StepLogEntry {
  readonly step: string;
  readonly state?: string;
  readonly decision?: string;
  readonly artifact?: string;
  readonly timestamp: string;
  readonly note?: string;
}

/** Per-project evidence + step-log recorder. One instance per QA project (e.g. QA-JAVA-TASKS-001). */
export class EvidenceRecorder {
  private readonly dir: string;
  private readonly stepLog: StepLogEntry[] = [];
  private readonly consoleErrors: string[] = [];
  private readonly networkFailures: string[] = [];
  private stepCounter = 0;

  constructor(projectName: string) {
    this.dir = path.join(__dirname, 'evidence', projectName);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Wires console + network capture for a page, with redaction applied before anything is stored. */
  attach(page: Page): void {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(redactText(`[${new Date().toISOString()}] ${msg.text()}`));
      }
    });
    page.on('requestfailed', (req) => {
      this.networkFailures.push(
        redactText(`[${new Date().toISOString()}] FAILED ${req.method()} ${req.url()} -- ${req.failure()?.errorText ?? 'unknown'}`),
      );
    });
    page.on('response', (res) => {
      if (res.status() >= 500) {
        this.networkFailures.push(redactText(`[${new Date().toISOString()}] ${res.status()} ${res.request().method()} ${res.url()}`));
      }
    });
  }

  async screenshot(page: Page, label: string): Promise<string> {
    const slug = `${String(this.stepCounter).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '-')}`;
    const file = path.join(this.dir, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  }

  step(entry: Omit<StepLogEntry, 'timestamp'>): void {
    this.stepCounter += 1;
    this.stepLog.push({ ...entry, timestamp: new Date().toISOString() });
  }

  /** Saves a sanitized request/response pair as evidence for a specific defect (spec section 15). */
  saveRequestEvidence(
    label: string,
    request: { url: string; method: string; headers: Record<string, string>; body?: string | null },
    response: { status: number; headers: Record<string, string>; body?: string | null },
  ): void {
    const slug = `${String(this.stepCounter).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '-')}.json`;
    const payload = {
      request: {
        url: request.url,
        method: request.method,
        headers: redactHeaders(request.headers),
        body: redactBody(request.body),
      },
      response: {
        status: response.status,
        headers: redactHeaders(response.headers),
        body: redactBody(response.body),
      },
    };
    fs.writeFileSync(path.join(this.dir, slug), JSON.stringify(payload, null, 2), 'utf-8');
  }

  finalize(): void {
    fs.writeFileSync(path.join(this.dir, 'step-log.json'), JSON.stringify(this.stepLog, null, 2), 'utf-8');
    fs.writeFileSync(path.join(this.dir, 'console-errors.log'), this.consoleErrors.join('\n'), 'utf-8');
    fs.writeFileSync(path.join(this.dir, 'network-failures.log'), this.networkFailures.join('\n'), 'utf-8');
  }
}
