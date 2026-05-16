export function parseCookieHeader(cookieHeader) {
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

export function getValidUpstreamOrigin(cookieHeader, proxyHost, referer) {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies.sfos_deoxy_base;
  if (raw) {
    try {
      const decoded = decodeURIComponent(raw);
      const originUrl = new URL(
        decoded.includes("://") ? decoded : `https://${decoded}`,
      );
      if (originUrl.host !== proxyHost) return originUrl.origin;
    } catch {
      /* ignore */
    }
  }
  if (referer) {
    try {
      const refTarget = new URL(referer).searchParams.get("target");
      if (refTarget) {
        const refUrl = new URL(refTarget);
        if (refUrl.host !== proxyHost) return refUrl.origin;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function recoverTargetFromCookie(requestUrl, cookieHeader, proxyHost, referer) {
  const upstreamOrigin = getValidUpstreamOrigin(cookieHeader, proxyHost, referer);
  if (!upstreamOrigin) return null;
  try {
    let path = requestUrl.pathname;
    if (path === "/deoxy" || path.startsWith("/deoxy/")) {
      path = path.replace(/^\/deoxy(?=\/|$)/, "") || "/";
    }
    const params = new URLSearchParams(requestUrl.search);
    params.delete("target");
    const search = params.toString();
    const suffix = search ? `?${search}` : "";
    return new URL(path + suffix + requestUrl.hash, upstreamOrigin).toString();
  } catch {
    return null;
  }
}

export function remapProxyTargetToUpstream(targetUrl, proxyHost, cookieHeader, referer) {
  const upstreamOrigin = getValidUpstreamOrigin(cookieHeader, proxyHost, referer);
  if (!upstreamOrigin) return null;
  try {
    return new URL(targetUrl.search + targetUrl.hash, upstreamOrigin).toString();
  } catch {
    return null;
  }
}

export function rewriteUrl(value, baseUrl, proxyOrigin) {
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
    if (proxyOrigin && absolute.origin === proxyOrigin) {
      let pathname = absolute.pathname;
      if (pathname === "/deoxy" || pathname.startsWith("/deoxy/")) {
        const inner = absolute.searchParams.get("target");
        if (inner) {
          try {
            const innerUrl = new URL(inner);
            if (innerUrl.origin !== proxyOrigin) {
              absolute.searchParams.forEach((val, key) => {
                if (key !== "target") innerUrl.searchParams.set(key, val);
              });
              return `/deoxy?target=${encodeURIComponent(innerUrl.toString())}`;
            }
          } catch {
            /* fall through */
          }
        }
        pathname = pathname.replace(/^\/deoxy(?=\/|$)/, "") || "/";
      }
      const params = new URLSearchParams(absolute.search);
      params.delete("target");
      const search = params.toString();
      const suffix = search ? `?${search}` : "";
      const upstream = new URL(pathname + suffix + absolute.hash, baseUrl);
      return `/deoxy?target=${encodeURIComponent(upstream.toString())}`;
    }
    return `/deoxy?target=${encodeURIComponent(absolute.toString())}`;
  } catch {
    return value;
  }
}
