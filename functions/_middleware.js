import { getValidUpstreamOrigin } from "./deoxy-shared.js";

const FUNCTION_PATHS = new Set(["/deoxy", "/ping", "/session"]);

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (FUNCTION_PATHS.has(url.pathname)) {
    return next();
  }

  if (request.method !== "GET") {
    return next();
  }
  const accept = request.headers.get("accept") || "";
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const isNavigation =
    accept.includes("text/html") || dest === "document" || mode === "navigate";
  if (!isNavigation) {
    return next();
  }

  if (url.pathname.includes(".")) {
    return next();
  }

  const referer = request.headers.get("referer") || request.headers.get("referrer");
  const cookieHeader = request.headers.get("cookie") || "";
  const upstreamOrigin = getValidUpstreamOrigin(cookieHeader, url.host, referer);
  if (!upstreamOrigin) {
    return next();
  }

  try {
    const params = new URLSearchParams(url.search);
    params.delete("target");
    const search = params.toString();
    const suffix = search ? `?${search}` : "";
    const nextTarget = new URL(`${url.pathname}${suffix}`, upstreamOrigin);
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    console.log("[deoxy] middleware redirect", url.pathname, "->", redirect);
    return Response.redirect(redirect, 302);
  } catch (error) {
    console.log("[deoxy] middleware error", error.message);
    return next();
  }
}
