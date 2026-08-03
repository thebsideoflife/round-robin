/**
 * Client error reporting.
 *
 * The vendor version POSTed to their telemetry endpoint. This one logs to the
 * console and, if you set one up, forwards to your own collector — nothing
 * leaves the browser by default.
 *
 * To wire up Sentry (or anything else), set VITE_ERROR_ENDPOINT to a URL that
 * accepts a JSON POST, or replace the body of `forward`.
 */
export interface ErrorContext {
  boundary?: string;
  [key: string]: unknown;
}

const ENDPOINT =
  typeof import.meta !== "undefined" ? import.meta.env?.VITE_ERROR_ENDPOINT : undefined;

function forward(payload: Record<string, unknown>) {
  if (!ENDPOINT) return;
  try {
    // keepalive so the report survives a navigation away from the failing page.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never itself throw.
  }
}

export function reportError(error: unknown, context: ErrorContext = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[round-robin]${context.boundary ? ` ${context.boundary}` : ""}`, err);
  forward({
    message: err.message,
    // Stacks can carry file paths and query values; only sent if you opt in.
    stack: err.stack?.slice(0, 4000),
    context,
    url: typeof location !== "undefined" ? location.pathname : undefined,
    at: new Date().toISOString(),
  });
}
