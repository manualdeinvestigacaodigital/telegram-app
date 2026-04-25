import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Api } from "telegram";
import {
  startTelegram,
  listChats,
  getMessages,
  searchMessagesInChat,
  searchMessagesAcrossChats,
  listMembers,
  downloadMessageMedia,
  downloadMessageThumbnail,
  resetTelegramSession,
} from "../services/telegram.js";
import {
  resolvePublicReference,
  getPublicMessages,
  searchPublicMessages,
  streamPublicMessages,
  streamSearchPublicMessages,
  discoverPublicReferences,
  searchPublicMessagesUniversalStream,
  downloadPublicMessageMedia,
  downloadPublicMessageThumbnail,
} from "../services/telegram_public.js";
import { searchGlobalEntities, loadGlobalReferences, searchGlobalEntitiesStream } from "../services/telegram_global.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CACHE_ROOT = path.join(PROJECT_ROOT, "public", "cache");


// PATCH FASE 4 — abertura real e miniatura segura.
function mediaContentType(filePath = "") {
  const ext = path.extname(String(filePath)).toLowerCase();
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if ([".mp4", ".m4v"].includes(ext)) return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function cachePathFromPublicUrl(url = "") {
  const clean = String(url || "").trim().replace(/\\/g, "/");
  if (!clean.startsWith("/cache/")) return null;
  const normalized = path.normalize(clean).replace(/^([/\\])+/, "");
  const full = path.join(PROJECT_ROOT, "public", normalized);
  if (!full.startsWith(CACHE_ROOT)) return null;
  return full;
}

async function sendCacheFile(req, res, publicUrl) {
  const filePath = cachePathFromPublicUrl(publicUrl);
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", mediaContentType(filePath));
    res.setHeader("Content-Disposition", "inline");
    return res.sendFile(filePath);
  } catch {
    return false;
  }
}

function mediaFallbackSvg(label = "mídia", kind = "media") {
  const isVideo = String(kind).toLowerCase().includes("video") || String(label).toLowerCase().includes("vídeo");
  const icon = isVideo ? "▶" : "▣";
  const safeLabel = String(label || "mídia").slice(0, 18).replace(/[<>&]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#eef4ff"/><rect x="7" y="7" width="82" height="82" rx="12" fill="#ffffff" stroke="#b8c4d8"/><text x="48" y="45" text-anchor="middle" font-size="26" font-family="Arial" fill="#2563eb" font-weight="700">${icon}</text><text x="48" y="66" text-anchor="middle" font-size="12" font-family="Arial" fill="#334155" font-weight="700">${safeLabel}</text></svg>`;
}

function sendSvgThumb(res, label, kind) {
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(mediaFallbackSvg(label, kind));
}

function pickFilters(query = {}) {
  return {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    author: query.author,
    username: query.username,
    phone: query.phone,
    text: query.text,
    forwarded: query.forwarded,
    hasMedia: query.hasMedia,
    mediaType: query.mediaType,
    viewsMin: query.viewsMin,
    viewsMax: query.viewsMax,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
}

function pickPublicUniversalFilters(query = {}) {
  const filters = pickFilters(query);
  delete filters.author;
  delete filters.username;
  delete filters.phone;
  delete filters.text;
  return filters;
}

router.get("/status", async (_req, res) =>
  res.json({ ok: true, service: "telegram-backend", now: new Date().toISOString() })
);

router.get("/chats", async (_req, res) => {
  try {
    const startedAt = Date.now();
    const refresh = String(_req.query.refresh || "").trim() === "1";
    const chats = await listChats(refresh);
    console.log(
      `[route /auth/chats] refresh=${refresh ? "1" : "0"} total=${Array.isArray(chats) ? chats.length : 0}`
    );
    return res.json({
      ok: true,
      total: chats.length,
      items: chats,
      meta: {
        operation: "chats_bootstrap",
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error("[route /auth/chats] erro:", error?.message || error);
    return res.status(500).json({ ok: false, error: error.message || "Falha ao listar chats." });
  }
});

// PATCH FASE 6D — restaura rota de stream da lista de chats sem interferir na busca global validada.
router.get("/chats/stream", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload) => {
    try { res.write(`${JSON.stringify(payload)}
`); } catch {}
  };

  try {
    const refresh = String(req.query.refresh || "").trim() === "1";
    const chats = await listChats(refresh);
    const total = Array.isArray(chats) ? chats.length : 0;
    send({ type: "start", total });
    for (let i = 0; i < total; i += 1) {
      send({ type: "chat", item: chats[i], processed: i + 1, total, percent: total ? Math.round(((i + 1) / total) * 100) : 100 });
    }
    send({ type: "done", total, items: chats });
    res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha ao carregar lista de chats em stream." });
    res.end();
  }
});

router.get("/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = Number(req.query.limit || 50);
    const data = await getMessages(chatId, limit, pickFilters(req.query));
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao obter mensagens." });
  }
});

router.get("/messages/:chatId/stream", async (req, res) => {
  const { chatId } = req.params;
  const limit = Number(req.query.limit || 50);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);
  try {
    await getMessages(chatId, limit, pickFilters(req.query), send);
    res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha ao obter mensagens." });
    res.end();
  }
});

router.get("/search/chat/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const query = String(req.query.query || "").trim();
    const limit = Number(req.query.limit || 100);
    const data = await searchMessagesInChat(chatId, query, limit, pickFilters(req.query));
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha na busca por chat." });
  }
});

router.get("/search/chat/:chatId/stream", async (req, res) => {
  const { chatId } = req.params;
  const query = String(req.query.query || "").trim();
  const limit = Number(req.query.limit || 100);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);
  try {
    await searchMessagesInChat(chatId, query, limit, pickFilters(req.query), send);
    res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha na busca por chat." });
    res.end();
  }
});


async function clearDirectoryContent(dir) {
  let deleted = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deleted += await clearDirectoryContent(full);
        continue;
      }
      await fs.unlink(full);
      deleted += 1;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return deleted;
}

router.post("/cache/clear", async (_req, res) => {
  try {
    const deleted = await clearDirectoryContent(CACHE_ROOT);
    return res.json({ ok: true, deleted });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao limpar cache de mídias." });
  }
});

router.get("/search/all", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const requestedLimit = Number(req.query.limit || 100);
    const perChatLimit = Number(req.query.perChatLimit || Math.max(50, Math.ceil(requestedLimit / 2)));
    const maxDialogs = req.query.maxDialogs === undefined || req.query.maxDialogs === "" ? 0 : Number(req.query.maxDialogs);
    const data = await searchMessagesAcrossChats(query, perChatLimit, maxDialogs, { ...pickFilters(req.query), limit: requestedLimit, light: true });
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha na busca global." });
  }
});

/* PATCH V68 - stream sem gargalo e cancelamento seguro */
router.get("/search/all/stream", async (req, res) => {
  const query = String(req.query.query || "").trim();
  const requestedLimit = Number(req.query.limit || 100);
  const perChatLimit = Number(req.query.perChatLimit || Math.max(50, Math.ceil(requestedLimit / 2)));
  const maxDialogs = req.query.maxDialogs === undefined || req.query.maxDialogs === "" ? 0 : Number(req.query.maxDialogs);
  let clientClosed = false;
  req.on("close", () => { clientClosed = true; });
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (payload) => {
    if (clientClosed || res.destroyed || res.writableEnded) return;
    res.write(JSON.stringify(payload)+"\n");
    res.flush?.();
  };
  try {
    send({ type: "progress", phase: "stream_open", processedDialogs: 0, totalDialogs: maxDialogs || 0, found: 0, total: requestedLimit, percent: 1 });
    await searchMessagesAcrossChats(
      query,
      perChatLimit,
      maxDialogs,
      { ...pickFilters(req.query), limit: requestedLimit, light: true, isAborted: () => clientClosed || res.destroyed || res.writableEnded },
      send
    );
    if (!clientClosed && !res.destroyed && !res.writableEnded) res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha na busca global." });
    if (!clientClosed && !res.destroyed && !res.writableEnded) res.end();
  }
});

router.get("/members/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = Number(req.query.limit || 500);
    const data = await listMembers(chatId, limit);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao listar membros." });
  }
});

router.get("/members/:chatId/stream", async (req, res) => {
  const { chatId } = req.params;
  const limit = Number(req.query.limit || 500);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);
  try {
    await listMembers(chatId, limit, send);
    res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha ao listar membros." });
    res.end();
  }
});

router.get("/global/entities", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Number(req.query.limit || 20);
    const entityTypes = String(req.query.entityTypes || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const data = await searchGlobalEntities(query, entityTypes, limit);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha na busca global de entidades." });
  }
});

/**
 * Busca global em stream real (NDJSON) para permitir preenchimento parcial da grade.
 */
router.get("/global/entities/stream", async (req, res) => {
  const query = String(req.query.query || "").trim();
  const limit = Number(req.query.limit || 20);
  const entityTypes = String(req.query.entityTypes || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload) => res.write(`${JSON.stringify(payload)}\n`);

  try {
    await searchGlobalEntitiesStream(query, entityTypes, limit, send);
    res.end();
  } catch (error) {
    send({ type: "fatal", error: error.message || "Falha na busca global de entidades." });
    res.end();
  }
});

router.get("/global/references", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Number(req.query.limit || 20);
    const entityTypes = String(req.query.entityTypes || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const data = await loadGlobalReferences(query, entityTypes, limit);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar referências." });
  }
});


// PATCH FASE 6D — ingresso/solicitação de acesso sem remover rotas estáveis da busca global validada.
function normalizeJoinReference(value = "") {
  let ref = String(value || "").trim();
  if (!ref) return "";
  ref = ref.replace(/^https?:\/\/(www\.)?t\.me\//i, "");
  ref = ref.replace(/^tg:\/\/resolve\?domain=/i, "");
  ref = ref.replace(/^tg:\/\/join\?invite=/i, "+");
  ref = decodeURIComponent(ref).trim();
  ref = ref.replace(/^\/+|\/+$/g, "");
  if (/^joinchat\//i.test(ref)) ref = "+" + ref.split("/").pop();
  if (!ref.startsWith("@") && !ref.startsWith("+") && ref) ref = "@" + ref;
  return ref;
}

function expectedJoinResultFromError(error, ref) {
  const raw = String(error?.errorMessage || error?.message || error || "").trim();
  const upper = raw.toUpperCase();
  if (upper.includes("USER_ALREADY_PARTICIPANT")) {
    return { ok: true, status: "already_participant", reference: ref, message: `A conta já participa de ${ref}.` };
  }
  if (upper.includes("INVITE_REQUEST_SENT") || upper.includes("JOIN_REQUEST_SENT")) {
    return { ok: true, status: "request_sent", reference: ref, message: `Solicitação de acesso enviada para ${ref}. Aguarde aprovação do administrador.` };
  }
  if (upper.includes("CHANNEL_PRIVATE") || upper.includes("CHAT_ADMIN_REQUIRED")) {
    return { ok: false, status: "private_or_restricted", reference: ref, error: `Não foi possível ingressar diretamente em ${ref}: o grupo/canal é privado, restrito ou exige aprovação/convite válido.`, rawError: raw };
  }
  if (upper.includes("USERNAME_INVALID") || upper.includes("USERNAME_NOT_OCCUPIED")) {
    return { ok: false, status: "invalid_username", reference: ref, error: `Não foi possível localizar ${ref}. O username público é inválido ou não está ocupado.`, rawError: raw };
  }
  if (upper.includes("CHANNELS_TOO_MUCH")) {
    return { ok: false, status: "channels_too_much", reference: ref, error: `Não foi possível ingressar em ${ref}: a conta atingiu o limite de canais/grupos.`, rawError: raw };
  }
  if (upper.includes("FLOOD") || upper.includes("FLOOD_WAIT")) {
    return { ok: false, status: "flood_wait", reference: ref, error: `O Telegram aplicou limite temporário de requisições. Aguarde antes de tentar novo ingresso em ${ref}.`, rawError: raw };
  }
  return { ok: false, status: "error", reference: ref, error: raw || "Falha ao ingressar/solicitar acesso.", rawError: raw };
}

async function joinPublicReference(reference) {
  const ref = normalizeJoinReference(reference);
  if (!ref) throw new Error("Referência pública não informada.");
  const tg = await startTelegram();
  try {
    if (ref.startsWith("+")) {
      const hash = ref.slice(1).trim();
      if (!hash) throw new Error("Convite público inválido.");
      await tg.invoke(new Api.messages.ImportChatInvite({ hash }));
      return { ok: true, status: "joined", reference: ref, message: `Ingresso efetivado por convite em ${ref}.` };
    }
    const entity = await tg.getEntity(ref);
    await tg.invoke(new Api.channels.JoinChannel({ channel: entity }));
    return { ok: true, status: "joined", reference: ref, message: `Ingresso efetivado com sucesso em ${ref}.` };
  } catch (error) {
    const mapped = expectedJoinResultFromError(error, ref);
    if (mapped.ok) return mapped;
    const err = new Error(mapped.error || "Falha ao ingressar/solicitar acesso.");
    err.payload = mapped;
    throw err;
  }
}

router.post("/public/join", async (req, res) => {
  try {
    const reference = String(req.body?.reference || req.query.reference || "").trim();
    const normalizedReference = normalizeJoinReference(reference);
    const result = await joinPublicReference(normalizedReference);
    return res.json(result);
  } catch (error) {
    const payload = error?.payload || expectedJoinResultFromError(error, normalizeJoinReference(req.body?.reference || req.query.reference || ""));
    return res.status(500).json(payload);
  }
});

router.get("/public/resolve", async (req, res) => {
  try {
    const reference = String(req.query.reference || "").trim();
    const data = await resolvePublicReference(reference);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao resolver referência pública." });
  }
});




router.get("/media/open", async (req, res) => {
  try {
    const chatId = String(req.query.chatId || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const data = await downloadMessageMedia(chatId, messageId);
    const target = data.mediaUrl || data.previewUrl || data.thumbnail;
    if (!target) return res.status(404).send("Mídia não localizada para esta mensagem.");
    if (await sendCacheFile(req, res, target)) return;
    return res.redirect(target);
  } catch (error) {
    return res.status(500).send(error.message || "Falha ao abrir mídia.");
  }
});

router.get("/media/thumb", async (req, res) => {
  try {
    const chatId = String(req.query.chatId || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const data = await downloadMessageThumbnail(chatId, messageId);
    const type = String(data.mediaType || "").toLowerCase();
    const target = data.thumbnail || data.previewUrl || (type === "photo" ? data.mediaUrl : null);
    if (target && await sendCacheFile(req, res, target)) return;
    if (target) return res.redirect(target);
    return sendSvgThumb(res, type === "video" ? "vídeo" : "foto", type || "media");
  } catch (error) {
    return sendSvgThumb(res, "mídia", "media");
  }
});

router.get("/media", async (req, res) => {
  try {
    const chatId = String(req.query.chatId || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const data = await downloadMessageMedia(chatId, messageId);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao baixar mídia." });
  }
});

router.get("/public/media/open", async (req, res) => {
  try {
    const reference = String(req.query.reference || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const data = await downloadPublicMessageMedia(reference, messageId);
    const target = data.mediaUrl || data.previewUrl || data.thumbnail;
    if (!target) return res.status(404).send("Mídia não localizada para esta mensagem.");
    if (await sendCacheFile(req, res, target)) return;
    return res.redirect(target);
  } catch (error) {
    return res.status(500).send(error.message || "Falha ao abrir mídia pública.");
  }
});

router.get("/public/media/thumb", async (req, res) => {
  try {
    const reference = String(req.query.reference || "").trim();
    const messageId = String(req.query.messageId || "").trim();
    const data = await downloadPublicMessageThumbnail(reference, messageId);
    const type = String(data.mediaType || data.item?.mediaType || data.media?.mediaType || "").toLowerCase();
    const target = data.thumbnail || data.previewUrl || (type === "photo" ? data.mediaUrl : null);
    if (target && await sendCacheFile(req, res, target)) return;
    if (target) return res.redirect(target);
    return sendSvgThumb(res, type === "video" ? "vídeo" : "foto", type || "media");
  } catch (error) {
    return sendSvgThumb(res, "mídia", "media");
  }
});



export default router;
