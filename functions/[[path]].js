import { handleDeoxyRequest } from "./lib/deoxy.js";
import { handleSessionRequest } from "./lib/session.js";

export async function onRequest(context) {
  const { request, next } = context;
  const pathname = new URL(request.url).pathname;

  if (pathname === "/ping") {
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "x-sfos-deoxy": "ping",
      },
    });
  }

  if (pathname === "/session") {
    return handleSessionRequest(context);
  }

  if (pathname === "/deoxy") {
    return handleDeoxyRequest(context);
  }

  return next();
}
