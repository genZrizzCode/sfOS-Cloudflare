export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/deoxy") {
    return next();
  }

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html") || request.method !== "GET") {
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
