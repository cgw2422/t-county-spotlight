/* TCountySpotlight service worker.
 * Bump VERSION to invalidate old caches on deploy. */
const VERSION = "v1";
const PRECACHE = `tcs-precache-${VERSION}`;
const RUNTIME = `tcs-runtime-${VERSION}`;
const OFFLINE_URL = "/offline/";
const PRECACHE_URLS = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];
const RUNTIME_MAX_ENTRIES = 150;

// Private / dynamic areas are never cached.
const NEVER_CACHE = [/^\/admin(\/|$)/, /^\/dashboard(\/|$)/, /^\/account(\/|$)/, /^\/api(\/|$)/, /^\/login(\/|$)/, /^\/register(\/|$)/, /^\/reset-password(\/|$)/, /^\/verify-email(\/|$)/];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    // Fetch the offline page without cookies so no personal data is cached.
    const res = await fetch(OFFLINE_URL, { credentials: "omit", cache: "reload" });
    if (res.ok) await cache.put(OFFLINE_URL, res);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("tcs-") && k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

function cacheable(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const cc = (response.headers.get("Cache-Control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  if (response.headers.has("Set-Cookie")) return false;
  return true;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME);
  const cached = await caches.match(event.request);
  const network = fetch(event.request)
    .then(async (res) => {
      if (cacheable(res)) {
        await cache.put(event.request, res.clone());
        trim(RUNTIME, RUNTIME_MAX_ENTRIES);
      }
      return res;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

async function networkFirstNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch {
    const cache = await caches.open(PRECACHE);
    return (await cache.match(OFFLINE_URL)) || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch POST etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations are never cached (pages are dynamic); we only fall back to the offline page.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return; // straight to network
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

// ───────────── Push notifications ─────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "TCountySpotlight";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = "/";
  try {
    const u = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin);
    if (u.origin === self.location.origin) target = u.href; // only open our own pages
  } catch {}
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url === target && "focus" in c) return c.focus();
    }
    for (const c of all) {
      if ("navigate" in c && new URL(c.url).origin === self.location.origin) {
        await c.focus();
        return c.navigate(target);
      }
    }
    return self.clients.openWindow(target);
  })());
});
