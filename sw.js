// Service worker: permette di installare l'app sul telefono (schermo intero) e la apre più in fretta.
// Strategia network-first: online prende sempre la versione aggiornata, offline mostra l'ultima vista.
const CACHE = "strozzi-v2.0.0";
const ASSETS = [
  "./", "index.html", "css/style.css", "fonts/geist-latin-wght-normal.woff2",
  "js/app.js", "js/ui.js", "js/util.js", "js/data.js", "js/config.js",
  "js/views/agenda.js", "js/views/appointment.js", "js/views/clients.js", "js/views/reminders.js", "js/views/settings.js",
  "vendor/supabase.js", "icons/logo-light.png", "icons/logo-ink.png", "icons/icon-192.png", "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});
