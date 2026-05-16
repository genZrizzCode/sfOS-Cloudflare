const STRIP_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "content-encoding",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
let sessionTableReady = false;

function isNavigationRequest(request) {
  const accept = request.headers.get("accept") || "";
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  return accept.includes("text/html") || dest === "document" || mode === "navigate";
}

async function ensureSessionTable(env) {
  if (!env || !env.DB || sessionTableReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS deoxy_sessions (id INTEGER PRIMARY KEY CHECK (id = 1), count INTEGER NOT NULL)",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO deoxy_sessions (id, count) VALUES (1, 0)",
  ).run();
  sessionTableReady = true;
}

async function incrementSessionCount(env) {
  if (!env || !env.DB) return null;
  await ensureSessionTable(env);
  await env.DB.prepare(
    "UPDATE deoxy_sessions SET count = count + 1 WHERE id = 1",
  ).run();
  const row = await env.DB.prepare(
    "SELECT count FROM deoxy_sessions WHERE id = 1",
  ).first();
  return row && typeof row.count === "number" ? row.count : null;
}

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
        const repairBrokenDeoxyBar = (url) => {
          try {
            const abs = new URL(url, window.location.href);
            if (abs.origin !== window.location.origin) return null;
            const p = abs.pathname;
            if (p !== "/deoxy" && !p.startsWith("/deoxy/")) return null;
            if (abs.searchParams.has("target")) return null;
            const m = document.cookie.match(/(?:^|;\\s*)sfos_deoxy_base=([^;]*)/);
            if (!m) return null;
            let upstreamOrigin;
            try {
              upstreamOrigin = decodeURIComponent(m[1].trim());
            } catch (e) {
              return null;
            }
            let path = p.replace(/^\\/deoxy(?=\\/|$)/, "") || "/";
            const upstream = new URL(
              path + abs.search + abs.hash,
              upstreamOrigin.includes("://") ? upstreamOrigin : "https://" + upstreamOrigin,
            ).toString();
            return prefix + encodeURIComponent(upstream);
          } catch (e) {
            return null;
          }
        };
        const toDeoxy = (url) => {
          if (!url || skip(url)) return url;
          try {
            const repaired = repairBrokenDeoxyBar(url);
            if (repaired) {
              log("repair SPA bar", url, "->", repaired);
              return repaired;
            }
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
            const abs = new URL(window.location.href);
            if (abs.pathname.startsWith("/deoxy")) {
              if (!abs.searchParams.has("target")) {
                const fixed = repairBrokenDeoxyBar(
                  abs.pathname + abs.search + abs.hash,
                );
                if (fixed) {
                  log("repair bar", reason, abs.href, "->", fixed);
                  nativeReplaceState({}, "", fixed);
                }
              }
              return;
            }
            if (abs.origin !== window.location.origin) return;
            const target = new URL(abs.pathname + abs.search + abs.hash, base);
            const next = prefix + encodeURIComponent(target.toString());
            log("guard", reason, abs.href, "->", next);
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
  STRIP_RESPONSE_HEADERS.forEach((name) => headers.delete(name));
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((pair) => {
        const idx = pair.indexOf("=");
        const key = idx === -1 ? pair.trim() : pair.slice(0, idx).trim();
        const val = idx === -1 ? "" : pair.slice(idx + 1).trim();
        return [key, val];
      })
      .filter(([key]) => key),
  );
}

/**
 * SPA routers (e.g. DuckDuckGo) resolve history URLs against the iframe URL
 * (/deoxy?target=...), which yields /deoxy?q=... without a target param.
 * Recover the upstream URL using sfos_deoxy_base from the last proxied origin.
 */
function recoverTargetFromCookie(requestUrl, cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies.sfos_deoxy_base;
  if (!raw) return null;
  let upstreamOrigin;
  try {
    upstreamOrigin = decodeURIComponent(raw);
  } catch {
    return null;
  }
  try {
    const originUrl = new URL(
      upstreamOrigin.includes("://") ? upstreamOrigin : `https://${upstreamOrigin}`,
    );
    let path = requestUrl.pathname;
    if (path === "/deoxy" || path.startsWith("/deoxy/")) {
      path = path.replace(/^\/deoxy(?=\/|$)/, "") || "/";
    }
    return new URL(path + requestUrl.search + requestUrl.hash, originUrl.origin).toString();
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  let target = url.searchParams.get("target");
  if (!target) {
    target = recoverTargetFromCookie(url, request.headers.get("cookie"));
  }

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
  let sessionCount = null;
  if (isNavigationRequest(request)) {
    try {
      sessionCount = await incrementSessionCount(env);
    } catch (error) {
      console.log("[deoxy] session increment failed", error.message);
    }
  }

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
    if (typeof sessionCount === "number") {
      responseHeaders.set("x-sfos-session", String(sessionCount));
    }
    return new Response(rewritten, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }
  if (contentType.includes("text/css")) {
    const css = await upstreamResponse.text();
    const rewritten = rewriteCss(css, targetUrl);
    responseHeaders.set(
      "content-length",
      String(new TextEncoder().encode(rewritten).length),
    );
    if (typeof sessionCount === "number") {
      responseHeaders.set("x-sfos-session", String(sessionCount));
    }
    return new Response(rewritten, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  }

  if (typeof sessionCount === "number") {
    responseHeaders.set("x-sfos-session", String(sessionCount));
  }
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
