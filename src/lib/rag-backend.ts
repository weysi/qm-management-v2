const DEFAULT_RAG_BACKEND_URL = "http://localhost:8001";

export function getRagBackendUrl(): string {
  return process.env.RAG_BACKEND_URL ?? DEFAULT_RAG_BACKEND_URL;
}

export function buildRagUrl(pathname: string): string {
  const base = getRagBackendUrl().replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export async function fetchRag(pathname: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    return await fetch(buildRagUrl(pathname), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function safeJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}
