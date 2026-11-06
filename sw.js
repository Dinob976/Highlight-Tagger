// Highlight-Tagger – Offline-Speicher
// Beim Ändern der App diese Nummer erhöhen, dann holt sich das iPhone die neue Version.
const CACHE = "highlight-tagger-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@500;600;700&display=swap";

async function cacheFonts(cache) {
  try {
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await cache.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
  } catch (e) { /* Schriften sind optional */ }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await cacheFonts(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Schriften: aus dem Speicher, sonst laden und merken
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === "opaque") cache.put(req.url, res.clone()); return res; }
      catch (e) { return new Response("", { status: 504 }); }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App-Dateien: sofort aus dem Speicher, im Hintergrund aktualisieren
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true }) ||
                (req.mode === "navigate" ? await cache.match("./index.html") : undefined);
    const update = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => undefined);
    if (hit) { event.waitUntil(update); return hit; }
    const res = await update;
    return res || (await cache.match("./index.html")) || new Response("Offline", { status: 503 });
  })());
});
