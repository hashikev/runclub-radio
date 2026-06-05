// Minimal service worker so the app is installable ("Add to Home Screen") and
// the shell loads fast. Audio files are NOT force-cached (they can be large and
// change per run); they stream normally.
const CACHE = "runclub-v1";
const SHELL = [
  "index.html", "dj.html", "runner.html",
  "css/styles.css",
  "js/transport.js", "js/sync.js", "js/dj.js", "js/runner.js",
  "js/config.js", "js/library.js",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/tracks/")) return; // let audio stream from network
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
