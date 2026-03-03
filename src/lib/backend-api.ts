const DEFAULT_BACKEND_URL = 'http://localhost:8001';

export function getBackendUrl(): string {
  return process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL;
}

export function buildBackendUrl(pathname: string): string {
  const base = getBackendUrl().replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export async function fetchBackend(pathname: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    return await fetch(buildBackendUrl(pathname), {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function safeJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}
