export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/deoxy") {
    return next();
  }

  const referer = request.headers.get("referer") || request.headers.get("referrer");
  if (!referer) {
    return next();
  }

  try {
    const refUrl = new URL(referer);
    const target = refUrl.searchParams.get("target");
    if (!target) {
      return next();
    }
    const targetUrl = new URL(target);
    const nextTarget = new URL(`${url.pathname}${url.search}`, targetUrl);
    const redirect = `/deoxy?target=${encodeURIComponent(nextTarget.toString())}`;
    return Response.redirect(redirect, 302);
  } catch {
    return next();
  }
}
