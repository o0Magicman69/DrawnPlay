// Bump the version to force clients to drop the old cached files.
const CACHE = "netball-v3";
const SHELL = ["/", "/index.html", "/style.css", "/playback-paths.js", "/app.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    // Plays live in the database, so those API calls always go to the network; only the player list is cached for offline use.
    const isPlayers = url.pathname === "/api/players";
    if (event.request.method !== "GET" || url.origin !== location.origin || (url.pathname.startsWith("/api/") && !isPlayers)) return;
    // Network first keeps edits fresh; the cache is the offline fallback.
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
