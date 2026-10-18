// Service worker minimale: permette di "installare" l'app sul telefono e la carica
// più velocemente. Strategia network-first: online prende sempre la versione aggiornata.
const CACHE = "strozzi-v1.0.0";
const ASSETS = [
  "./", "index.html", "css/style.css", "js/app.js", "js/util.js", "js/config.js",
  "vendor/supabase.js", "vendor/fullcalendar.min.js", "vendor/fullcalendar-it.min.js",
  "icons/logo.png", "icons/icon-192.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase ecc.: mai in cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
