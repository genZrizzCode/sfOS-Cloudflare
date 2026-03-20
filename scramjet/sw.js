importScripts("/scramjet/scramjet.all.js");

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const { ScramjetServiceWorker } = self.$scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const isScramjetFileRequest = (requestUrl) => {
  try {
    const url = new URL(requestUrl);
    const files = scramjet.config?.files;
    if (!files) return false;
    const matchFile = (file) => {
      if (!file) return false;
      const absolute = file.startsWith("http")
        ? file
        : `${self.location.origin}${file.startsWith("/") ? file : `/${file}`}`;
      return url.href === absolute || url.pathname === new URL(absolute).pathname;
    };
    return matchFile(files.all) || matchFile(files.sync) || matchFile(files.wasm);
  } catch {
    return false;
  }
};

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (!scramjet.config) {
        return fetch(event.request);
      }
      if (isScramjetFileRequest(event.request.url)) {
        return fetch(event.request);
      }
      if (scramjet.route(event)) {
        return scramjet.fetch(event);
      }
      return fetch(event.request);
    })(),
  );
});
