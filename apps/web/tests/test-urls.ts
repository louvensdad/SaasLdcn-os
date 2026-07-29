export const WEB_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
export const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

export function webUrl(path: string) {
  return `${WEB_BASE_URL}${path}`;
}
