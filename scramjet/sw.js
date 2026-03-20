importScripts(
  "/scramjet/scramjet.codecs.js",
  "/scramjet/scramjet.config.js",
  "/scramjet/scramjet.bundle.js",
  "/scramjet/scramjet.worker.js",
);

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const scramjet = new self.ScramjetServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (scramjet.route(event)) {
        return scramjet.fetch(event);
      }
      return fetch(event.request);
    })(),
  );
});
