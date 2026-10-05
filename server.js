const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
let submissions = [];
let activeVisitors = 0;
const sseClients = [];

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(msg));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "init", submissions, activeVisitors })}\n\n`);
    sseClients.push(res);
    req.on("close", () => {
      const i = sseClients.indexOf(res);
      if (i !== -1) sseClients.splice(i, 1);
    });
    return;
  }

  if (req.url === "/api/visit") {
    activeVisitors++;
    broadcast({ type: "visitors", activeVisitors });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/api/leave") {
    activeVisitors = Math.max(0, activeVisitors - 1);
    broadcast({ type: "visitors", activeVisitors });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/api/submit" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const entry = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          ...data,
          ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
          userAgent: req.headers["user-agent"] || "",
        };
        submissions.unshift(entry);
        broadcast({ type: "submission", entry });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  if (req.url === "/api/submissions") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(submissions));
    return;
  }

  if (req.url === "/api/visitors") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ activeVisitors }));
    return;
  }

  let filePath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin panel at /admin.html`);
});
