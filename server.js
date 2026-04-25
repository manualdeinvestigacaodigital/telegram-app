import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import authRouter from "./routes/auth.js";
import "./services/envSetup.js";
import { startTelegram } from "./services/telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.platform === "win32") {
    const chromeCandidates = [
      process.env.CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    ].filter(Boolean);

    for (const chromePath of chromeCandidates) {
      if (exists(chromePath)) {
        try {
          const child = spawn(chromePath, [url], { detached: true, stdio: "ignore" });
          child.unref();
          return true;
        } catch {}
      }
    }

    try {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        shell: true,
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  if (process.platform === "darwin") {
    try {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  try {
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}



// PATCH FASE 3 MIDIA REAL — serve arquivos de mídia com Content-Type e Range HTTP 206.
// Mantém express.static para o restante, mas garante execução correta de vídeos em nova aba.
function mediaContentType(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".ogg" || ext === ".ogv") return "video/ogg";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function safeCachePathFromUrl(reqPath) {
  const decoded = decodeURIComponent(String(reqPath || ""));
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, normalized);
  if (!fullPath.startsWith(PUBLIC_DIR)) return null;
  return fullPath;
}

function sendCachedMedia(req, res, filePath) {
  if (!filePath || !exists(filePath)) return res.status(404).send("Arquivo de mídia não encontrado.");
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) return res.status(404).send("Arquivo de mídia vazio ou inválido.");
  const contentType = mediaContentType(filePath);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentType);
  const range = req.headers.range;
  if (range && (contentType.startsWith("video/") || contentType.startsWith("audio/"))) {
    const parts = String(range).replace(/bytes=/, "").split("-");
    const start = Math.max(0, parseInt(parts[0], 10) || 0);
    const end = parts[1] ? Math.min(stat.size - 1, parseInt(parts[1], 10)) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }
  res.setHeader("Content-Length", String(stat.size));
  return fs.createReadStream(filePath).pipe(res);
}

app.get(/^\/cache\/media\/.+$/, (req, res) => {
  const filePath = safeCachePathFromUrl(req.path);
  return sendCachedMedia(req, res, filePath);
});

app.get(/^\/cache\/avatars\/.+$/, (req, res) => {
  const filePath = safeCachePathFromUrl(req.path);
  return sendCachedMedia(req, res, filePath);
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use("/auth", authRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "telegram-backend",
    port: PORT,
    now: new Date().toISOString(),
  });
});


function clearCacheDirectory(rootDir) {
  let deleted = 0;
  fs.mkdirSync(rootDir, { recursive: true });
  for (const entry of fs.readdirSync(rootDir)) {
    const entryPath = path.join(rootDir, entry);
    try {
      const stat = fs.lstatSync(entryPath);
      if (stat.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(entryPath);
      }
      deleted += 1;
    } catch {}
  }
  fs.mkdirSync(path.join(rootDir, "media", "photos"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "media", "videos"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "media", "audio"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "media", "documents"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "media", "thumbs"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "media", "unknown"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "avatars"), { recursive: true });
  return deleted;
}

function handleClearMediaCache(_req, res) {
  const cacheRoot = path.join(PUBLIC_DIR, "cache");
  try {
    const deleted = clearCacheDirectory(cacheRoot);
    return res.json({ ok: true, deleted, path: cacheRoot });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao limpar cache de mídias." });
  }
}

app.post("/clear-media-cache", handleClearMediaCache);
app.post("/auth/cache/clear", handleClearMediaCache);

async function bootstrap() {
  const url = `http://localhost:${PORT}`;

  console.log("Iniciando backend Telegram...");
  console.log("Validando sessão/login antes de abrir a interface...");

  try {
    await startTelegram();
    console.log("Sessão Telegram pronta.");
  } catch (error) {
    console.error("Falha ao iniciar sessão Telegram:", error?.message || error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Interface: ${url}`);

    const opened = openBrowser(url);
    if (!opened) console.log(`Abra manualmente: ${url}`);
  });
}

bootstrap();
