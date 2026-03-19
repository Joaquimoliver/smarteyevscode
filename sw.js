/**
 * SmartEye - Service Worker
 * Permite uso offline básico e instalação como PWA
 */

const CACHE_NAME = "smarteye-camera-v1";
const ASSETS = ["/camera/", "/camera/index.html"];

// Instala e cacheia assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativa e limpa caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: network-first, fallback para cache
self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/socket.io/")) return; // não cachear WebSocket
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
