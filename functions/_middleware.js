export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const isNavigation = accept.includes("text/html") || dest === "document" || mode === "navigate";
  const isScramjetPath = url.pathname === "/scramjet" || url.pathname.startsWith("/scramjet/");
  const scramjetAssets = new Set([
    "/scramjet/sw.js",
    "/scramjet/scramjet.all.js",
    "/scramjet/scramjet.sync.js",
    "/scramjet/scramjet.wasm.wasm",
    "/scramjet/scramjet.bundle.js",
    "/scramjet/scramjet.client.js",
    "/scramjet/scramjet.worker.js",
    "/scramjet/scramjet.codecs.js",
    "/scramjet/scramjet.config.js",
  ]);
  const isScramjetAsset = scramjetAssets.has(url.pathname);

  if (isScramjetPath) {
    if (request.method !== "GET" || !isNavigation || isScramjetAsset) {
      return next();
    }
    const bootstrapHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Starting Scramjet…</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; background: #0f1115; color: #e8ecf2; }
      .card { max-width: 520px; margin: 0 auto; background: #1b1f27; padding: 24px; border-radius: 16px; border: 1px solid #2b3240; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 0; opacity: 0.8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Starting Scramjet…</h1>
      <p>Setting up the service worker so this proxied page can load.</p>
    </div>
    <script>
      (async () => {
        const originalUrl = ${JSON.stringify(url.href)};
        const attempts = Number(sessionStorage.getItem("sfos-scramjet-bootstrap") || "0");
        if (attempts > 1) {
          document.querySelector("p").textContent =
            "Scramjet couldn't start on this device. Open sfOS first, then retry this link.";
          return;
        }
        sessionStorage.setItem("sfos-scramjet-bootstrap", String(attempts + 1));
        try {
          if ("serviceWorker" in navigator) {
            await navigator.serviceWorker.register("/scramjet/sw.js");
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
              await new Promise((resolve) => {
                navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
                setTimeout(resolve, 2000);
              });
            }
          }
        } catch (error) {
          console.warn("Scramjet bootstrap failed", error);
        }
        location.replace(originalUrl);
      })();
    </script>
  </body>
</html>`;
    return new Response(bootstrapHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/deoxy") {
    return next();
  }
  if (url.pathname.startsWith("/bare-mux/") || url.pathname.startsWith("/epoxy/")) {
    return next();
  }

  if (request.method !== "GET") {
    return next();
  }
  if (!isNavigation) {
    return next();
  }

  if (url.pathname.includes(".")) {
    return next();
  }

  const referer = request.headers.get("referer") || request.headers.get("referrer");
  let target = null;

  if (referer) {
    try {
      const refUrl = new URL(referer);
      target = refUrl.searchParams.get("target");
    } catch {
      target = null;
    }
  }

  if (!target) {
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((pair) => pair.trim().split("="))
        .filter((pair) => pair[0]),
    );
    target = cookies.sfos_deoxy_base ? decodeURIComponent(cookies.sfos_deoxy_base) : null;
  }

  if (!target) {
    return next();
  }

  try {
    const targetUrl = new URL(target);
    const nextTarget = new URL(`${url.pathname}${url.search}`, targetUrl);
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    console.log("[deoxy] middleware redirect", url.pathname, "->", redirect);
    return Response.redirect(redirect, 302);
  } catch (error) {
    console.log("[deoxy] middleware error", error.message);
    return next();
  }
}
