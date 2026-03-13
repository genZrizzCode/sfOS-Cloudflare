const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = __dirname;
const PORT = process.env.PORT || 8443;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

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
        document.addEventListener(
          "click",
          (event) => {
            const anchor = event.target.closest("a[href]");
            if (!anchor) return;
            const href = anchor.getAttribute("href");
            const next = toDeoxy(href);
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
            const next = toDeoxy(action);
            if (next && next !== action) {
              form.setAttribute("action", next);
            }
          },
          true,
        );
        ["pushState", "replaceState"].forEach((method) => {
          const original = history[method];
          history[method] = function(state, title, url) {
            if (typeof url === "string") {
              const next = toDeoxy(url);
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
                const next = toDeoxy(input);
                if (next && next !== input) {
                  return originalFetch(next, init);
                }
              } else if (input && input.url) {
                const next = toDeoxy(input.url);
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
            const next = toDeoxy(url);
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
  STRIP_RESPONSE_HEADERS.forEach((name) => {
    if (headers[name]) delete headers[name];
  });
}

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function maybeRedirectDeoxy(req, res) {
  if (req.method !== "GET") return false;
  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return false;
  try {
    const refUrl = new URL(referer);
    const target = refUrl.searchParams.get("target");
    if (!target) return false;
    const targetUrl = new URL(target);
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const nextTarget = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      targetUrl,
    );
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    res.writeHead(302, { Location: redirect });
    res.end();
    return true;
  } catch {
    return false;
  }
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname || "/";

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.join(ROOT, pathname);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendError(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(filePath).pipe(res);
  });
}

function handleDeoxy(req, res) {
  const parsed = url.parse(req.url, true);
  const target = parsed.query.target;

  if (!target) {
    sendError(res, 400, "Missing target query parameter");
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    sendError(res, 400, "Invalid target URL");
    return;
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    sendError(res, 400, "Only http and https are supported");
    return;
  }

  const client = targetUrl.protocol === "https:" ? https : http;

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
    },
  };
  options.headers["accept-encoding"] = "identity";

  const deoxyReq = client.request(options, (deoxyRes) => {
    const status = deoxyRes.statusCode || 500;
    const headers = { ...deoxyRes.headers };
    stripHeaders(headers);

    if (headers.location && REDIRECT_STATUSES.has(status)) {
      headers.location = rewriteUrl(headers.location, targetUrl);
    }

    const contentType = headers["content-type"] || "";
    if (contentType.includes("text/html")) {
      let body = "";
      deoxyRes.setEncoding("utf8");
      deoxyRes.on("data", (chunk) => {
        body += chunk;
      });
      deoxyRes.on("end", () => {
        const rewritten = rewriteHtml(body, targetUrl);
        headers["content-length"] = Buffer.byteLength(rewritten);
        res.writeHead(status, headers);
        res.end(rewritten);
      });
      return;
    }

    res.writeHead(status, headers);
    deoxyRes.pipe(res);
  });

  deoxyReq.on("error", (error) => {
    console.error("Deoxy error:", error.message);
    if (!res.headersSent) {
      sendError(res, 502, "Upstream request failed");
    } else {
      res.end();
    }
  });

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    req.pipe(deoxyReq);
  } else {
    deoxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname || "/";

  if (pathname === "/deoxy") {
    handleDeoxy(req, res);
  } else if (maybeRedirectDeoxy(req, res)) {
    return;
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`sfOS server running at http://localhost:${PORT}/`);
  console.log(`Deoxy endpoint available at http://localhost:${PORT}/deoxy?target=<url>`);
});
