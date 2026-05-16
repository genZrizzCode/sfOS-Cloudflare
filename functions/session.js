let sessionTableReady = false;

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

export async function onRequest({ env }) {
  if (!env || !env.DB) {
    return new Response(JSON.stringify({ count: null, error: "D1 not configured" }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  try {
    await ensureSessionTable(env);
    const row = await env.DB.prepare(
      "SELECT count FROM deoxy_sessions WHERE id = 1",
    ).first();
    const count = row && typeof row.count === "number" ? row.count : 0;
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ count: null, error: "Session lookup failed" }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
