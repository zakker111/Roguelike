/**
 * Minimal static dev server (no dependencies).
 * - Serves files from project root.
 * - Maps "/" to "/public/index.html".
 * - Correct MIME types for common assets.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
}

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split("?")[0]);
    if (reqPath === "/" || reqPath === "") {
      // Serve public/index.html
      const indexPath = path.join(ROOT, "public", "index.html");
      return sendFile(res, indexPath);
    }
    // Prevent directory traversal
    reqPath = reqPath.replace(/\\/g, "/");
    if (reqPath.includes("..")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("400 Bad Request");
    }
    // Resolve to filesystem
    const fsPath = path.join(ROOT, reqPath);
    // If request points to a directory, try index.html within it
    if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
      const maybeIndex = path.join(fsPath, "index.html");
      if (fs.existsSync(maybeIndex)) {
        return sendFile(res, maybeIndex);
      }
    }
    // Serve file
    return sendFile(res, fsPath);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`[dev] Serving at http://localhost:${PORT}`);
  console.log(`[dev] Root: ${ROOT}`);
  console.log(`[dev] Entry: /public/index.html`);
});