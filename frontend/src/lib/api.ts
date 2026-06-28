import { BACKEND_URL } from "./config";

/** A failed API call — carries the HTTP status + the parsed problem body (RFC-9457) when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * GET JSON from the read API. Throws `ApiError` on a non-2xx response — the caller surfaces
 * an unavailable state; we never substitute a fabricated value (CLAUDE.md #1).
 */
export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body — leave null */
    }
    throw new ApiError(res.status, body, `GET ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}