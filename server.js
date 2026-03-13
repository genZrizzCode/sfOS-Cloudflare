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
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
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

  const deoxyReq = client.request(options, (deoxyRes) => {
    // Pass through status and headers.
    res.writeHead(deoxyRes.statusCode || 500, deoxyRes.headers);
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

  if (pathname === "/deoxy") {
    handleDeoxy(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`sfOS server running at http://localhost:${PORT}/`);
  console.log(`Deoxy endpoint available at http://localhost:${PORT}/deoxy?target=<url>`);
});

