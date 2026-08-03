import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Plain TanStack Start build. No the previous host wrapper.
 *
 * The previous config imported a vendor build wrapper, which
 * silently bundled the TanStack devtools, React, Tailwind, tsconfig paths,
 * nitro, VITE_* injection and the vendor's own error-reporting plugins. Everything
 * it did is now explicit here, so the build is inspectable and the project has
 * no dependency on the vendor's release cadence.
 *
 * `target: "cloudflare-module"` makes nitro emit .output/server/index.mjs plus
 * .output/public — the two paths wrangler.jsonc points at. Change it to "node"
 * for a plain Node host, or "vercel"/"netlify" as needed; nothing else in the
 * app cares.
 */
export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      target: "cloudflare-module",
      // src/server.ts wraps the SSR handler to attach security headers and to
      // turn h3's swallowed 500s back into a readable error page.
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});
