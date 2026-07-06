/* ==========================================================================
   TripSync — Service Worker
   Strategy:
   - App shell (HTML/CSS/JS/icons): Cache First, so the app opens instantly
     even offline. Falls back to network if not yet cached, and re-caches
     the fresh copy for next time.
   - Navigation requests that fail entirely (no cache, no network) fall
     back to offline.html.
   - Supabase API calls are never intercepted — they always hit the network,
     since cached data would go stale immediately for a realtime app.
   ========================================================================== */

const CACHE_NAME = "tripsync-cache-v1";
const OFFLINE_URL = "offline.html";

const APP_SHELL = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "offline.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

/* --- Install: pre-cache the app shell --- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

/* --- Activate: clean up old cache versions --- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/* --- Fetch: cache-first for our own assets, network-only for everything else (Supabase, fonts CDN, etc.) --- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests with our cache strategy.
  const isSameOrigin = url.origin === self.location.origin;

  if (req.method !== "GET") return; // never intercept writes (POST/PATCH/DELETE to Supabase)

  if (!isSameOrigin) {
    // Let Supabase / CDN font requests hit the network directly.
    return;
  }

  // Navigation requests (address bar / reload): try network first for
  // freshness, fall back to cache, then to the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Static assets: cache-first, refresh cache in background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
