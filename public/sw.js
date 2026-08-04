/*
 * Round Robin service worker.
 *
 * Deliberately conservative for a clinical tool:
 *   - HTML and API traffic are NEVER served stale. Network-first, and if the
 *     network fails we show the offline page rather than yesterday's numbers.
 *   - Only immutable build assets and icons are cached.
 *   - Nothing containing patient or staff data is written to CacheStorage.
 *
 * Field updates: bumping CACHE_VERSION on deploy makes every installed device
 * pick up the new build on its next launch, with an in-app "Update" prompt for
 * sessions that are already open. No terminal, no app store review.
 */
const CACHE_VERSION = "rr-v5-admin";
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/brand/round-robin-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Delete every cache that isn't this exact version — including ones from
      // an earlier version of this same worker, so a stale shell can't survive
      // a deploy.
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// The app calls this after the user accepts an update prompt.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isImmutableAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(?:js|css|woff2?|png|svg|ico)$/.test(url.pathname));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch server-function RPCs, auth, or API traffic. Note that the
  // cache-first branch below is opt-in by path anyway, so an unmatched prefix
  // here is harmless — this list is belt and braces.
  if (
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/_server") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth")
  ) {
    return;
  }

  // Navigations: network-first, offline page as the only fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(ASSET_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // Build assets: cache-first, they are content-hashed.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && res.status === 200) cache.put(request, res.clone());
        return res;
      })(),
    );
  }
});
