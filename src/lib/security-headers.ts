/**
 * Response security headers.
 *
 * Applied to every SSR response in src/server.ts. Written to be safe to turn
 * on today (nothing here breaks the current app) while getting the headers a
 * HIPAA security review will ask for in place before there is any PHI.
 *
 * The CSP ships in Report-Only mode by default because TanStack Start emits
 * inline hydration scripts, and silently breaking a clinical tool is worse
 * than a slightly weaker header. Set CSP_ENFORCE=1 once you've watched the
 * report endpoint for a release and confirmed it's clean.
 */

interface HeaderOptions {
  supabaseUrl?: string;
  enforceCsp?: boolean;
}

function buildCsp({ supabaseUrl }: HeaderOptions): string {
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

  // Whatever AI endpoint is configured must be reachable from the page for
  // streamed responses; everything else stays closed.
  const aiOrigin = (() => {
    try {
      return new URL(process.env.AI_BASE_URL ?? "https://api.openai.com/v1").origin;
    } catch {
      return "https://api.openai.com";
    }
  })();

  const connect = ["'self'", supabaseOrigin, supabaseWs, aiOrigin].filter(Boolean);

  return [
    "default-src 'self'",
    // 'unsafe-inline' covers the SSR hydration script. Replace with a
    // per-request nonce when you move off Report-Only.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    // blob: is required so recorded audio can be handed to the uploader.
    "media-src 'self' blob:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(options: HeaderOptions = {}): Record<string, string> {
  const enforce = options.enforceCsp ?? process.env.CSP_ENFORCE === "1";
  const csp = buildCsp(options);

  return {
    [enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: csp,

    // Clickjacking: this app should never be framed.
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Force HTTPS for two years including subdomains. Safe on a platform that
    // already terminates TLS everywhere.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

    // Only the microphone is needed, and only same-origin. Everything else off.
    "Permissions-Policy": [
      "microphone=(self)",
      "camera=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),

    // Isolate the browsing context group.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",

    // Belt and braces: never let an intermediary cache an authenticated page.
    "Cache-Control": "no-store, must-revalidate",
  };
}

/** Returns a copy of `response` with the security headers applied. */
export function withSecurityHeaders(response: Response, options: HeaderOptions = {}): Response {
  const headers = new Headers(response.headers);
  const isDocument = (headers.get("content-type") ?? "").includes("text/html");

  for (const [key, value] of Object.entries(securityHeaders(options))) {
    // Immutable build assets should stay cacheable.
    if (key === "Cache-Control" && !isDocument) continue;
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
