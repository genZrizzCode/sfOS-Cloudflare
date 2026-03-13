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

  const requestHeaders = new Headers(request.headers);
  // Remove hop-by-hop and Cloudflare-specific headers that should not be forwarded.
  const hopByHopHeaders = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
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

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

