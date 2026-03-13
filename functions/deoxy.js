const STRIP_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "content-encoding",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function rewriteUrl(value, baseUrl) {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    trimmed.startsWith("/deoxy?target=") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }
  try {
    const absolute = new URL(trimmed, baseUrl);
    return `/deoxy?target=${encodeURIComponent(absolute.toString())}`;
  } catch {
    return value;
  }
}

function rewriteSrcset(value, baseUrl) {
  if (!value) return value;
  return value
    .split(",")
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (!parts.length) return entry;
      const rewritten = rewriteUrl(parts[0], baseUrl);
      return [rewritten, ...parts.slice(1)].join(" ");
    })
    .join(", ");
}

function rewriteHtml(html, baseUrl) {
  let next = html;
  next = next.replace(
    /\s(href|src|action)=["']([^"']+)["']/gi,
    (match, attr, value) => ` ${attr}="${rewriteUrl(value, baseUrl)}"`,
  );
  next = next.replace(
    /\ssrcset=["']([^"']+)["']/gi,
    (match, value) => ` srcset="${rewriteSrcset(value, baseUrl)}"`,
  );
  return injectDeoxyScript(next, baseUrl);
}

function injectDeoxyScript(html, baseUrl) {
  const base = baseUrl.toString();
  const script = `
    <script>
      (function() {
        const base = new URL(${JSON.stringify(base)});
        const prefix = "/deoxy?target=";
        const debug = true;
        const log = (...args) => {
          if (debug) console.log("[deoxy]", ...args);
        };
        const skip = (url) => {
          if (!url) return true;
          return (
            url.startsWith(prefix) ||
            url.startsWith("data:") ||
            url.startsWith("javascript:") ||
            url.startsWith("mailto:") ||
            url.startsWith("tel:") ||
            url.startsWith("#")
          );
        };
        const toDeoxy = (url) => {
          if (!url || skip(url)) return url;
          try {
            const absolute = new URL(url, base);
            return prefix + encodeURIComponent(absolute.toString());
          } catch (error) {
            return url;
          }
        };
        const rewriteIfNeeded = (url, label) => {
          const next = toDeoxy(url);
          if (next && next !== url) {
            log(label, url, "->", next);
          }
          return next;
        };
        document.addEventListener(
          "click",
          (event) => {
            const anchor = event.target.closest("a[href]");
            if (!anchor) return;
            const href = anchor.getAttribute("href");
            const next = rewriteIfNeeded(href, "navigate");
            if (next && next !== href) {
              event.preventDefault();
              window.location.assign(next);
            }
          },
          true,
        );
        document.addEventListener(
          "submit",
          (event) => {
            const form = event.target;
            if (!form || !form.getAttribute) return;
            const action = form.getAttribute("action") || base.toString();
            const next = rewriteIfNeeded(action, "submit");
            if (next && next !== action) {
              form.setAttribute("action", next);
            }
          },
          true,
        );
        try {
          if (window.location && window.location.assign) {
            const originalAssign = window.location.assign.bind(window.location);
            window.location.assign = function(url) {
              const next = rewriteIfNeeded(url, "location.assign");
              return originalAssign(next || url);
            };
          }
          if (window.location && window.location.replace) {
            const originalReplace = window.location.replace.bind(window.location);
            window.location.replace = function(url) {
              const next = rewriteIfNeeded(url, "location.replace");
              return originalReplace(next || url);
            };
          }
        } catch (error) {
          log("location override failed", error.message);
        }
        ["pushState", "replaceState"].forEach((method) => {
          const original = history[method];
          history[method] = function(state, title, url) {
            if (typeof url === "string") {
              const next = rewriteIfNeeded(url, "history." + method);
              return original.call(this, state, title, next || url);
            }
            return original.call(this, state, title, url);
          };
        });
        if (window.fetch) {
          const originalFetch = window.fetch.bind(window);
          window.fetch = function(input, init) {
            try {
              if (typeof input === "string") {
                const next = rewriteIfNeeded(input, "fetch");
                if (next && next !== input) {
                  return originalFetch(next, init);
                }
              } else if (input && input.url) {
                const next = rewriteIfNeeded(input.url, "fetch");
                if (next && next !== input.url) {
                  return originalFetch(new Request(next, input), init);
                }
              }
            } catch (error) {}
            return originalFetch(input, init);
          };
        }
        if (window.XMLHttpRequest) {
          const originalOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            const next = rewriteIfNeeded(url, "xhr");
            return originalOpen.call(this, method, next || url, ...rest);
          };
        }
      })();
    </script>
  `;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${script}`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => `${match}${script}`);
  }
  return `${script}${html}`;
}

function stripHeaders(headers) {
  STRIP_RESPONSE_HEADERS.forEach((name) => headers.delete(name));
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  if (!target) {
    return new Response("Missing target query parameter", { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("Invalid target URL", { status: 400 });
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return new Response("Only http and https are supported", { status: 400 });
  }

  console.log("[deoxy] request", targetUrl.toString());

  const requestHeaders = new Headers(request.headers);
  // Remove hop-by-hop and Cloudflare-specific headers that should not be forwarded.
  const hopByHopHeaders = [
    "connection",
    "keep-alive",
    "deoxy-authenticate",
    "deoxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "cf-ray",
    "cf-connecting-ip",
    "cf-ipcountry",
    "cf-visitor",
  ];
  hopByHopHeaders.forEach((h) => requestHeaders.delete(h));
  requestHeaders.set("accept-encoding", "identity");

  const init = {
    method: request.method,
    headers: requestHeaders,
  };

  if (!(request.method === "GET" || request.method === "HEAD")) {
    init.body = request.body;
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl.toString(), init);
  } catch (error) {
    return new Response("Upstream request failed", { status: 502 });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  // Avoid setting forbidden headers back to the client.
  hopByHopHeaders.forEach((h) => responseHeaders.delete(h));
  stripHeaders(responseHeaders);

  responseHeaders.append(
    "set-cookie",
    `sfos_deoxy_base=${encodeURIComponent(targetUrl.origin)}; Path=/; SameSite=Lax`,
  );

  if (responseHeaders.has("location") && REDIRECT_STATUSES.has(upstreamResponse.status)) {
    responseHeaders.set(
      "location",
      rewriteUrl(responseHeaders.get("location"), targetUrl),
    );
  }

  const contentType = responseHeaders.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await upstreamResponse.text();
    const rewritten = rewriteHtml(html, targetUrl);
    responseHeaders.set("content-length", String(new TextEncoder().encode(rewritten).length));
    return new Response(rewritten, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
