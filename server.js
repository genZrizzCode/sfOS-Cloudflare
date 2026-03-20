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
  ".mjs": "text/javascript; charset=utf-8",
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
let localSessionCount = 0;

function rewriteUrl(value, baseUrl) {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    trimmed.startsWith("/deoxy?target=") ||
    trimmed.startsWith("about:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("moz-extension:") ||
    trimmed.startsWith("safari-extension:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("chrome-extension:") ||
    trimmed.startsWith("edge:") ||
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

function rewriteCss(css, baseUrl) {
  if (!css) return css;
  let next = css.replace(
    /@import\s+(?:url\()?\s*['"]?([^'")\s]+)['"]?\s*\)?/gi,
    (match, value) => match.replace(value, rewriteUrl(value, baseUrl)),
  );
  next = next.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match, quote, value) => {
      const rewritten = rewriteUrl(value, baseUrl);
      if (!rewritten || rewritten === value) return match;
      const q = quote || "";
      return `url(${q}${rewritten}${q})`;
    },
  );
  return next;
}

function rewriteHtml(html, baseUrl) {
  let next = html;
  next = next.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    "",
  );
  next = next.replace(
    /\s(href|src|action)=["']([^"']+)["']/gi,
    (match, attr, value) => ` ${attr}="${rewriteUrl(value, baseUrl)}"`,
  );
  next = next.replace(
    /\ssrcset=["']([^"']+)["']/gi,
    (match, value) => ` srcset="${rewriteSrcset(value, baseUrl)}"`,
  );
  next = next.replace(
    /\sstyle=(["'])([^"']*)\1/gi,
    (match, quote, value) =>
      ` style=${quote}${rewriteCss(value, baseUrl)}${quote}`,
  );
  next = next.replace(
    /(<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'])([^"']*)(["'][^>]*>)/gi,
    (match, start, content, end) => {
      const updated = content.replace(/url\s*=\s*([^;]+)/i, (m, urlValue) => {
        const rewritten = rewriteUrl(urlValue.trim(), baseUrl);
        return `url=${rewritten}`;
      });
      return `${start}${updated}${end}`;
    },
  );
  next = next.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (match, attrs, value) =>
      `<style${attrs}>${rewriteCss(value, baseUrl)}</style>`,
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
        const logStore = [];
        const writeLog = (level, ...args) => {
          try {
            logStore.push({ level, message: args.map(String).join(" "), ts: Date.now() });
            if (logStore.length > 200) logStore.shift();
            window.__deoxyLogs = logStore;
          } catch (error) {}
          if (!debug) return;
          try {
            const handler =
              (console && console[level] && console[level].bind(console)) ||
              (console && console.log && console.log.bind(console));
            if (handler) handler("[deoxy]", ...args);
          } catch (error) {}
        };
        const log = (...args) => writeLog("log", ...args);
        const nativePushState = history.pushState.bind(history);
        const nativeReplaceState = history.replaceState.bind(history);
        const normalizeUrlInput = (input) => {
          if (input == null) return null;
          if (typeof input === "string") return input;
          if (input instanceof URL) return input.toString();
          if (typeof input === "object" && "href" in input) {
            try {
              return String(input.href);
            } catch (error) {
              return null;
            }
          }
          try {
            return String(input);
          } catch (error) {
            return null;
          }
        };
        log("injected", window.location.href);
        try {
          document.cookie =
            "sfos_deoxy_base=" +
            encodeURIComponent(base.origin) +
            "; Path=/; SameSite=Lax";
          log("cookie set", base.origin);
        } catch (error) {
          log("cookie set failed", error.message);
        }
        const skip = (url) => {
          if (!url) return true;
          return (
            url.startsWith(prefix) ||
            url.startsWith("about:") ||
            url.startsWith("blob:") ||
            url.startsWith("data:") ||
            url.startsWith("javascript:") ||
            url.startsWith("mailto:") ||
            url.startsWith("moz-extension:") ||
            url.startsWith("safari-extension:") ||
            url.startsWith("tel:") ||
            url.startsWith("chrome-extension:") ||
            url.startsWith("edge:") ||
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
        const ensureDeoxyUrl = (reason) => {
          try {
            if (window.location.pathname.startsWith("/deoxy")) return;
            const current = new URL(window.location.href);
            if (current.origin !== window.location.origin) return;
            const target = new URL(
              current.pathname + current.search + current.hash,
              base,
            );
            const next = prefix + encodeURIComponent(target.toString());
            log("guard", reason, current.href, "->", next);
            nativeReplaceState({}, "", next);
          } catch (error) {
            log("guard failed", error.message);
          }
        };
        const rewriteSrcsetValue = (value) => {
          if (!value) return value;
          return value
            .split(",")
            .map((entry) => {
              const parts = entry.trim().split(/\\s+/);
              if (!parts.length) return entry;
              const rewritten = toDeoxy(parts[0]);
              return [rewritten || parts[0], ...parts.slice(1)].join(" ");
            })
            .join(", ");
        };
        const rewriteAttribute = (el, attr) => {
          if (!el || !el.getAttribute) return;
          const value = el.getAttribute(attr);
          if (!value) return;
          const next = toDeoxy(value);
          if (next && next !== value) {
            el.setAttribute(attr, next);
          }
        };
        const rewriteElement = (el) => {
          if (!el || !el.getAttribute) return;
          if (el.hasAttribute("href")) rewriteAttribute(el, "href");
          if (el.hasAttribute("src")) rewriteAttribute(el, "src");
          if (el.hasAttribute("action")) rewriteAttribute(el, "action");
          if (el.hasAttribute("data-src")) rewriteAttribute(el, "data-src");
          if (el.hasAttribute("data-lazy-src")) rewriteAttribute(el, "data-lazy-src");
          if (el.hasAttribute("data-original")) rewriteAttribute(el, "data-original");
          if (el.hasAttribute("poster")) rewriteAttribute(el, "poster");
          if (el.hasAttribute("srcset")) {
            const value = el.getAttribute("srcset");
            const next = rewriteSrcsetValue(value);
            if (next && next !== value) {
              el.setAttribute("srcset", next);
            }
          }
          if (el.hasAttribute("data-srcset")) {
            const value = el.getAttribute("data-srcset");
            const next = rewriteSrcsetValue(value);
            if (next && next !== value) {
              el.setAttribute("data-srcset", next);
            }
          }
        };
        const rewriteFormAction = (form, label) => {
          if (!form || !form.getAttribute) return;
          const action = form.getAttribute("action") || base.toString();
          const next = rewriteIfNeeded(action, label || "form.action");
          if (next && next !== action) {
            form.setAttribute("action", next);
          }
        };
        const scan = (root) => {
          if (!root) return;
          if (root.nodeType === 1) rewriteElement(root);
          if (!root.querySelectorAll) return;
          root
            .querySelectorAll(
              "a[href], form[action], link[href], script[src], img[src], iframe[src], source[src], video[src], audio[src], img[data-src], source[data-src], video[poster]",
            )
            .forEach((el) => rewriteElement(el));
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
            rewriteFormAction(form, "submit");
          },
          true,
        );
        try {
          const originalSubmit = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function(...args) {
            rewriteFormAction(this, "form.submit");
            return originalSubmit.apply(this, args);
          };
        } catch (error) {
          log("form.submit override failed", error.message);
        }
        try {
          const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
          if (originalRequestSubmit) {
            HTMLFormElement.prototype.requestSubmit = function(...args) {
              rewriteFormAction(this, "form.requestSubmit");
              return originalRequestSubmit.apply(this, args);
            };
          }
        } catch (error) {
          log("form.requestSubmit override failed", error.message);
        }
        try {
          if (window.location && window.location.assign) {
            const originalAssign = window.location.assign.bind(window.location);
            window.location.assign = function(url) {
              const urlString = normalizeUrlInput(url);
              const next = urlString
                ? rewriteIfNeeded(urlString, "location.assign")
                : null;
              return originalAssign(next || urlString || url);
            };
          }
          if (window.location && window.location.replace) {
            const originalReplace = window.location.replace.bind(window.location);
            window.location.replace = function(url) {
              const urlString = normalizeUrlInput(url);
              const next = urlString
                ? rewriteIfNeeded(urlString, "location.replace")
                : null;
              return originalReplace(next || urlString || url);
            };
          }
          if (window.open) {
            const originalOpen = window.open.bind(window);
            window.open = function(url, name, features) {
              const urlString = normalizeUrlInput(url);
              const next = urlString ? rewriteIfNeeded(urlString, "window.open") : null;
              return originalOpen(next || urlString || url, name, features);
            };
          }
          const locProto = Object.getPrototypeOf(window.location);
          const hrefDesc = Object.getOwnPropertyDescriptor(locProto, "href");
          if (hrefDesc && hrefDesc.configurable && hrefDesc.set) {
            Object.defineProperty(locProto, "href", {
              configurable: true,
              enumerable: hrefDesc.enumerable,
              get: hrefDesc.get ? hrefDesc.get.bind(window.location) : undefined,
              set: function(value) {
                const urlString = normalizeUrlInput(value);
                const next = urlString
                  ? rewriteIfNeeded(urlString, "location.href")
                  : null;
                return hrefDesc.set.call(this, next || urlString || value);
              },
            });
          } else {
            log("location.href override skipped");
          }
        } catch (error) {
          log("location override failed", error.message);
        }
        ["pushState", "replaceState"].forEach((method) => {
          const original =
            method === "pushState" ? nativePushState : nativeReplaceState;
          history[method] = function(state, title, url) {
            const urlString = normalizeUrlInput(url);
            if (urlString) {
              const next = rewriteIfNeeded(urlString, "history." + method);
              const result = original.call(this, state, title, next || urlString);
              ensureDeoxyUrl("history." + method);
              return result;
            }
            const result = original.call(this, state, title, url);
            ensureDeoxyUrl("history." + method);
            return result;
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
              } else if (input instanceof URL) {
                const urlString = input.toString();
                const next = rewriteIfNeeded(urlString, "fetch");
                if (next && next !== urlString) {
                  return originalFetch(next, init);
                }
              } else if (input && input.url) {
                const next = rewriteIfNeeded(String(input.url), "fetch");
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
            const urlString = normalizeUrlInput(url);
            const next = urlString ? rewriteIfNeeded(urlString, "xhr") : null;
            return originalOpen.call(this, method, next || urlString || url, ...rest);
          };
        }
        scan(document);
        ensureDeoxyUrl("init");
        window.addEventListener("popstate", () => ensureDeoxyUrl("popstate"));
        window.addEventListener("hashchange", () => ensureDeoxyUrl("hashchange"));
        window.setInterval(() => ensureDeoxyUrl("interval"), 1500);
        try {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === "attributes") {
                rewriteElement(mutation.target);
                return;
              }
              if (mutation.type === "childList") {
                mutation.addedNodes.forEach((node) => {
                  if (node.nodeType !== 1) return;
                  rewriteElement(node);
                  scan(node);
                });
              }
            });
          });
          observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: [
              "href",
              "src",
              "action",
              "srcset",
              "data-src",
              "data-srcset",
              "data-lazy-src",
              "data-original",
              "poster",
            ],
          });
        } catch (error) {
          log("mutation observer failed", error.message);
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

function parseCookies(header = "") {
  const cookies = {};
  header.split(";").forEach((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return;
    cookies[key] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

function isNavigationRequest(req) {
  const accept = req.headers.accept || "";
  const dest = (req.headers["sec-fetch-dest"] || "").toLowerCase();
  const mode = (req.headers["sec-fetch-mode"] || "").toLowerCase();
  return accept.includes("text/html") || dest === "document" || mode === "navigate";
}

function maybeRedirectDeoxy(req, res) {
  if (req.method !== "GET") return false;
  if (!isNavigationRequest(req)) return false;
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (
    requestUrl.pathname === "/scramjet" ||
    requestUrl.pathname.startsWith("/scramjet/") ||
    requestUrl.pathname.startsWith("/bare-mux/") ||
    requestUrl.pathname.startsWith("/epoxy/")
  ) {
    return false;
  }
  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return false;
  try {
    const refUrl = new URL(referer);
    const target = refUrl.searchParams.get("target");
    if (!target) return false;
    const targetUrl = new URL(target);
    const nextTarget = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      targetUrl,
    );
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    console.log("[deoxy] referer-redirect", req.url, "->", redirect);
    res.writeHead(302, { Location: redirect });
    res.end();
    return true;
  } catch (error) {
    console.log("[deoxy] referer-redirect failed", error.message);
    return false;
  }
}

function maybeRedirectDeoxyFromCookie(req, res) {
  if (req.method !== "GET") return false;
  if (!isNavigationRequest(req)) return false;
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname || "";
  if (
    pathname === "/scramjet" ||
    pathname.startsWith("/scramjet/") ||
    pathname.startsWith("/bare-mux/") ||
    pathname.startsWith("/epoxy/")
  ) {
    return false;
  }
  if (pathname.includes(".")) return false;
  const cookies = parseCookies(req.headers.cookie || "");
  if (!cookies.sfos_deoxy_base) return false;
  try {
    const base = new URL(cookies.sfos_deoxy_base);
    const nextTarget = new URL(`${parsed.pathname}${parsed.search || ""}`, base);
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    console.log("[deoxy] cookie-redirect", req.url, "->", redirect);
    res.writeHead(302, { Location: redirect });
    res.end();
    return true;
  } catch (error) {
    console.log("[deoxy] cookie-redirect failed", error.message);
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

  console.log("[deoxy] request", targetUrl.toString());
  if (isNavigationRequest(req)) {
    localSessionCount += 1;
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
    const cookieValue = `sfos_deoxy_base=${encodeURIComponent(
      targetUrl.origin,
    )}; Path=/; SameSite=Lax`;
    if (headers["set-cookie"]) {
      const existing = Array.isArray(headers["set-cookie"])
        ? headers["set-cookie"]
        : [headers["set-cookie"]];
      headers["set-cookie"] = [...existing, cookieValue];
    } else {
      headers["set-cookie"] = cookieValue;
    }

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
    if (contentType.includes("text/css")) {
      let body = "";
      deoxyRes.setEncoding("utf8");
      deoxyRes.on("data", (chunk) => {
        body += chunk;
      });
      deoxyRes.on("end", () => {
        const rewritten = rewriteCss(body, targetUrl);
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

  if (pathname === "/ping") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  } else if (pathname === "/session") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ count: localSessionCount, source: "local" }));
  } else if (pathname === "/deoxy") {
    handleDeoxy(req, res);
  } else if (maybeRedirectDeoxy(req, res)) {
    return;
  } else if (maybeRedirectDeoxyFromCookie(req, res)) {
    return;
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`sfOS server running at http://localhost:${PORT}/`);
  console.log(`Deoxy endpoint available at http://localhost:${PORT}/deoxy?target=<url>`);
});
