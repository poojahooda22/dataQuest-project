// The DataQuest read API base. From VITE_BACKEND_URL (build-inlined by Vite). Normalized hard: a leading
// BOM/zero-width char or stray whitespace in the env value turns an absolute URL into a relative path
// (the browser then resolves it against the frontend origin), so strip those plus any trailing slash.
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000")
  .replace(/[﻿​\s]+/g, "")
  .replace(/\/+$/, "");