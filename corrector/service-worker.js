const CACHE_NAME = "corrector-offline-v10";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js?v=20260608-reading",
  "./vendor/jspdf.umd.min.js",
  "../assets/components.js",
  "../assets/css/global.css",
  "../assets/css/essentials.css",
  "../assets/svg/blizlab_logo_shade.svg",
  "../assets/svg/icons/check_2_fill.svg",
  "../assets/svg/icons/settings_3_fill.svg",
  "../assets/svg/icons/ko-fi.svg",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("corrector-offline-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const responseCopy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseCopy))
          );
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => {
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./");
        return Response.error();
      }))
  );
});
