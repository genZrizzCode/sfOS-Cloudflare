export async function onRequest() {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "x-sfos-deoxy": "ping",
    },
  });
}
