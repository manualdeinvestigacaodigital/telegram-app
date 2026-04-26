import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Api } from "telegram";
import { startTelegram } from "./telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "../public");
const CACHE_DIR = path.join(PUBLIC_DIR, "cache");
const MEDIA_ROOT_DIR = path.join(CACHE_DIR, "media");
const AVATAR_DIR = path.join(CACHE_DIR, "avatars");
const MEDIA_DIRS = {
  photos: path.join(MEDIA_ROOT_DIR, "photos"),
  videos: path.join(MEDIA_ROOT_DIR, "videos"),
  audio: path.join(MEDIA_ROOT_DIR, "audio"),
  documents: path.join(MEDIA_ROOT_DIR, "documents"),
  thumbs: path.join(MEDIA_ROOT_DIR, "thumbs"),
  unknown: path.join(MEDIA_ROOT_DIR, "unknown"),
};
function ensureDir(dirPath) { if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true }); }
ensureDir(CACHE_DIR); ensureDir(AVATAR_DIR); Object.values(MEDIA_DIRS).forEach(ensureDir);

function fileSizeSafe(filePath) { try { return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0; } catch { return 0; } }
function minExpectedMediaBytes(mediaType) { if (mediaType === "photo" || mediaType === "sticker") return 512; if (mediaType === "video") return 16 * 1024; if (mediaType === "audio" || mediaType === "voice") return 1024; return 1; }
function cachedMediaIsValid(filePath, mediaType) { return fileSizeSafe(filePath) >= minExpectedMediaBytes(mediaType); }
function removeInvalidCachedMedia(filePath, mediaType) { try { if (fs.existsSync(filePath) && !cachedMediaIsValid(filePath, mediaType)) fs.unlinkSync(filePath); } catch {} }
async function downloadMediaWithRetry(tg, msg, outputFile, mediaType) { removeInvalidCachedMedia(outputFile, mediaType); if (cachedMediaIsValid(outputFile, mediaType)) return true; let lastError = null; for (let attempt = 0; attempt < 2; attempt++) { try { await tg.downloadMedia(msg, { outputFile }); if (cachedMediaIsValid(outputFile, mediaType)) return true; removeInvalidCachedMedia(outputFile, mediaType); } catch (error) { lastError = error; removeInvalidCachedMedia(outputFile, mediaType); } } if (lastError) throw lastError; return false; }
function ensureThumbValid(thumbFile) { try { if (fs.existsSync(thumbFile) && fs.statSync(thumbFile).size < 256) fs.unlinkSync(thumbFile); } catch {} return fileSizeSafe(thumbFile) >= 256; }

function safeFileName(value) { return String(value || "").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, ""); }
function publicUrlFromAbsolute(filePath) { const relative = path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/"); return `/${relative}`; }
async function tryDownloadMediaThumb(tg, msg, outputFile) { try { await tg.downloadMedia(msg, { thumb: -1, outputFile }); return true; } catch { return false; } }
function normalizeChatId(entity, resolved) { return entity?.id?.toString?.() ?? entity?.channelId?.toString?.() ?? entity?.chatId?.toString?.() ?? entity?.userId?.toString?.() ?? resolved?.id ?? "public"; }
async function ensureAvatarForSender(sender) {
  if (!sender) return null;
  const senderId = sender?.id?.toString?.() ?? sender?.channelId?.toString?.() ?? sender?.chatId?.toString?.() ?? sender?.userId?.toString?.() ?? "";
  if (!senderId) return null;
  const target = path.join(AVATAR_DIR, `${safeFileName(senderId)}.jpg`);
  try {
    if (!fs.existsSync(target) && typeof sender.downloadProfilePhoto === "function") {
      await sender.downloadProfilePhoto({ file: target });
    }
  } catch {}
  return fs.existsSync(target) ? publicUrlFromAbsolute(target) : null;
}
async function ensurePublicMessageMedia(tg, chatId, msg, mediaType) {
  const mimeType = msg.file?.mimeType || msg.document?.mimeType || null;
  const fileName = msg.file?.name || msg.document?.fileName || null;
  const extByType = mediaType === "photo" ? ".jpg" : mediaType === "video" ? ".mp4" : mediaType === "audio" ? ".ogg" : mediaType === "pdf" ? ".pdf" : (fileName && path.extname(fileName)) || ".bin";
  const baseName = `${safeFileName(chatId)}_${safeFileName(msg.id)}`;
  const targetDir = mediaType === "photo" ? MEDIA_DIRS.photos : mediaType === "video" ? MEDIA_DIRS.videos : mediaType === "audio" ? MEDIA_DIRS.audio : ["pdf","document","sticker"].includes(mediaType) ? MEDIA_DIRS.documents : MEDIA_DIRS.unknown;
  const outputFile = path.join(targetDir, `${baseName}${extByType}`);
  const thumbFile = path.join(MEDIA_DIRS.thumbs, `${baseName}.jpg`);
  const response = { hasMedia: Boolean(mediaType), mediaType: mediaType || null, mimeType, fileName, extension: extByType, size: msg.file?.size ?? null, localPath: null, mediaUrl: null, previewUrl: null, thumbnailPath: null, thumbnail: null, hasThumbnail: false, downloadStatus: mediaType ? "deferred" : "none", downloadError: null, existsOnDisk: false, isPreviewable: false, previewMode: "none", detectedButFailed: false };
  if (!mediaType) return response;
  if (mediaType === "photo") { response.isPreviewable = true; response.previewMode = "image"; } else if (mediaType === "video") { response.isPreviewable = true; response.previewMode = "video"; }
  try {
    const downloadableTypes = ["photo", "video", "audio", "voice", "pdf", "document", "sticker"];
    if (downloadableTypes.includes(mediaType)) { try { await downloadMediaWithRetry(tg, msg, outputFile, mediaType); } catch (error) { response.downloadStatus = "failed"; response.detectedButFailed = true; response.downloadError = error?.message || "Falha ao baixar mídia pública."; } }
    if (cachedMediaIsValid(outputFile, mediaType)) { response.localPath = outputFile; response.mediaUrl = publicUrlFromAbsolute(outputFile); response.existsOnDisk = true; response.downloadStatus = "success"; }
    if (mediaType === "photo" && response.mediaUrl) { response.previewUrl = response.mediaUrl; response.thumbnailPath = response.localPath; response.thumbnail = response.mediaUrl; response.hasThumbnail = true; return response; }
    if (mediaType === "video") { if (!ensureThumbValid(thumbFile)) { try { await tryDownloadMediaThumb(tg, msg, thumbFile); } catch {} } if (ensureThumbValid(thumbFile)) { response.thumbnailPath = thumbFile; response.thumbnail = publicUrlFromAbsolute(thumbFile); response.previewUrl = response.mediaUrl || response.thumbnail; response.hasThumbnail = true; } else { response.previewUrl = response.mediaUrl || null; } return response; }
    if (["pdf", "document", "sticker"].includes(mediaType) && fs.existsSync(thumbFile)) { response.thumbnailPath = thumbFile; response.thumbnail = publicUrlFromAbsolute(thumbFile); response.previewUrl = response.thumbnail; response.hasThumbnail = true; }
  } catch (error) { response.downloadStatus = "failed"; response.detectedButFailed = true; response.downloadError = error?.message || "Falha ao verificar cache de mídia."; }
  return response; }

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isMeaningfulFilterValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  const blocked = new Set([
    "nome do autor",
    "@username",
    "username",
    "telefone",
    "219...",
    "dd/mm/aaaa",
    "ex.: osint, deic, roubo",
  ]);
  return !blocked.has(normalized);
}

function toBooleanFilter(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "sim", "yes"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no"].includes(normalized)) return false;
  return null;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 10_000_000_000 ? num * 1000 : num;
      return new Date(ms).toISOString();
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

function normalizePublicReference(reference = "") {
  let raw = String(reference || "").trim();
  if (!raw) throw new Error("Referência pública não informada.");
  try { raw = decodeURIComponent(raw); } catch {}
  let normalized = raw
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^https?:\/\/telegram\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .split("#")[0];
  let parts = normalized.split("/").filter(Boolean);
  if (parts[0] && ["s", "addstickers"].includes(String(parts[0]).toLowerCase())) parts = parts.slice(1);
  if (parts[0] && String(parts[0]).toLowerCase() === "c") {
    throw new Error("Referência pública inválida para consulta pública: links /c/ exigem acesso interno ao chat. Use @username ou link público t.me/usuario.");
  }
  const username = String(parts[0] || "").replace(/^@/, "").trim();
  if (!username) throw new Error("Referência pública inválida.");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new Error(`Referência pública inválida: "${username}" não é um @username válido. Use o botão Usar de uma entidade com username público ou informe @username manualmente.`);
  }
  return {
    raw,
    username,
    normalizedRef: `@${username}`,
    originalPath: normalized,
    messageHint: parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : null,
  };
}
function parseDateInput(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }

  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    return endOfDay ? new Date(y, mo - 1, d, 23, 59, 59, 999).getTime() : new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  return null;
}

function normalizeFilterOptions(options = {}) {
  return {
    dateFrom: options.dateFrom ? String(options.dateFrom).trim() : "",
    dateTo: options.dateTo ? String(options.dateTo).trim() : "",
    author: normalizeText(options.author),
    username: normalizeText(options.username),
    phone: normalizeText(options.phone),
    text: normalizeText(options.text),
    forwarded: toBooleanFilter(options.forwarded),
    hasMedia: toBooleanFilter(options.hasMedia),
    mediaType: normalizeText(options.mediaType),
    viewsMin: toNumberOrNull(options.viewsMin),
    viewsMax: toNumberOrNull(options.viewsMax),
    sortBy: ["date", "views", "authorName", "messageId", "chatTitle"].includes(options.sortBy)
      ? options.sortBy
      : "date",
    sortDir: String(options.sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc",
  };
}

function applyMessageFilters(messages = [], rawOptions = {}) {
  const options = normalizeFilterOptions(rawOptions);

  let filtered = messages.filter((msg) => {
    const msgDate = msg.date ? new Date(msg.date).getTime() : null;
    const fromTs = parseDateInput(options.dateFrom, false);
    const toTs = parseDateInput(options.dateTo, true);

    if (fromTs !== null && msgDate !== null && msgDate < fromTs) return false;
    if (toTs !== null && msgDate !== null && msgDate > toTs) return false;

    if (isMeaningfulFilterValue(options.author)) {
      const hay = normalizeText(msg.authorName);
      if (!hay.includes(options.author)) return false;
    }

    if (isMeaningfulFilterValue(options.username)) {
      const hay = normalizeText(msg.username);
      if (!hay.includes(options.username.replace(/^@/, ""))) return false;
    }

    if (isMeaningfulFilterValue(options.phone)) {
      const hay = normalizeText(msg.phone);
      if (!hay.includes(options.phone)) return false;
    }

    if (options.text) {
      const hay = normalizeText(msg.text);
      if (!hay.includes(options.text)) return false;
    }

    if (options.forwarded !== null && Boolean(msg.isForwarded) !== options.forwarded) return false;
    if (options.hasMedia !== null && Boolean(msg.media?.hasMedia || msg.mediaType) !== options.hasMedia) return false;

    if (options.mediaType) {
      const hay = normalizeText(msg.mediaType || msg.media?.mediaType);
      if (hay !== options.mediaType) return false;
    }

    const views = Number(msg.views || 0);
    if (options.viewsMin !== null && views < options.viewsMin) return false;
    if (options.viewsMax !== null && views > options.viewsMax) return false;

    return true;
  });

  const sortFactor = options.sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let av = null;
    let bv = null;

    switch (options.sortBy) {
      case "views":
        av = Number(a.views || 0);
        bv = Number(b.views || 0);
        break;
      case "authorName":
        av = normalizeText(a.authorName);
        bv = normalizeText(b.authorName);
        break;
      case "messageId":
        av = Number(a.messageId || 0);
        bv = Number(b.messageId || 0);
        break;
      case "chatTitle":
        av = normalizeText(a.chatTitle);
        bv = normalizeText(b.chatTitle);
        break;
      case "date":
      default:
        av = a.date ? new Date(a.date).getTime() : 0;
        bv = b.date ? new Date(b.date).getTime() : 0;
        break;
    }

    if (av < bv) return -1 * sortFactor;
    if (av > bv) return 1 * sortFactor;
    return 0;
  });

  return filtered;
}

function buildMeta(messages, rawOptions = {}, operation = "", extra = {}) {
  const options = normalizeFilterOptions(rawOptions);
  return {
    operation,
    total: messages.length,
    filters: options,
    generatedAt: new Date().toISOString(),
    ...extra,
  };
}

async function extractSenderFields(msg) {
  let authorName = null;
  let username = null;
  let phone = null;

  try {
    const sender = await msg.getSender();
    if (sender) {
      authorName =
        sender.title ||
        [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() ||
        null;
      username = sender.username || null;
      phone = sender.phone || null;
    }
  } catch {}

  return { authorName, username, phone };
}

function detectMediaType(msg) {
  const mime = msg.file?.mimeType || msg.document?.mimeType || "";
  if (msg.photo) return "photo";
  if (msg.video || mime.startsWith("video/")) return "video";
  if (msg.voice) return "voice";
  if (msg.audio || mime.startsWith("audio/")) return "audio";
  if (msg.sticker) return "sticker";
  if (mime.includes("pdf")) return "pdf";
  if (msg.document) return "document";
  return null;
}

function extractExternalUrlsFromText(text = "") {
  const matches = String(text || "").match(/https?:\/\/[^\s<>")]+/gi) || [];
  return matches.map((item) => String(item).trim()).filter(Boolean);
}

function buildPublicSearchTargets(msg, item = null) {
  const text = String(msg?.message || "");
  const externalLinks = extractExternalUrlsFromText(text);
  const fileName = msg?.file?.name || msg?.document?.fileName || item?.media?.fileName || "";
  const mimeType = msg?.file?.mimeType || msg?.document?.mimeType || item?.media?.mimeType || "";
  const mediaType = item?.mediaType || item?.media?.mediaType || detectMediaType(msg) || "";
  const extension = item?.media?.extension || "";
  const messageLink = item?.postLink || item?.link || "";
  const mediaCandidates = [
    item?.mediaUrl || "",
    item?.previewUrl || "",
    item?.thumbnail || "",
    item?.media?.mediaUrl || "",
    item?.media?.previewUrl || "",
    item?.media?.thumbnail || "",
    item?.media?.thumbnailPath || "",
    item?.media?.localPath || "",
  ];

  return [
    text,
    ...externalLinks,
    fileName,
    mimeType,
    mediaType,
    extension,
    messageLink,
    ...mediaCandidates,
  ].map((value) => normalizeText(value)).filter(Boolean);
}

function matchesPublicTerm(msg, item, term) {
  const normalized = normalizeText(term);
  if (!normalized) return false;
  return buildPublicSearchTargets(msg, item).some((field) => field.includes(normalized));
}

function extractForwardInfo(msg) {
  const fwd = msg?.fwdFrom;
  if (!fwd) {
    return {
      isForwarded: false,
      forwardOriginName: null,
      forwardOriginId: null,
      forwardOriginType: null,
      forwardDate: null,
      forwardPostAuthor: null,
    };
  }

  const fromId =
    fwd.fromId?.channelId?.toString?.() ??
    fwd.fromId?.chatId?.toString?.() ??
    fwd.fromId?.userId?.toString?.() ??
    null;

  let forwardOriginType = null;
  if (fwd.fromId?.channelId) forwardOriginType = "channel";
  else if (fwd.fromId?.chatId) forwardOriginType = "group";
  else if (fwd.fromId?.userId) forwardOriginType = "user";

  return {
    isForwarded: true,
    forwardOriginName: fwd.fromName || null,
    forwardOriginId: fromId,
    forwardOriginType,
    forwardDate: normalizeDate(fwd.date),
    forwardPostAuthor: fwd.postAuthor || null,
  };
}


async function enrichPublicMessageLight(entity, resolved, msg) {
  const senderInfo = await extractSenderFields(msg);
  const mediaType = detectMediaType(msg);
  const chatIdNorm = normalizeChatId(entity, resolved);
  const cachedMedia = cachedPublicMessageMedia(chatIdNorm, msg.id, mediaType);
  const messageLink = `https://t.me/${resolved.username}/${msg.id}`;
  return {
    chatId: chatIdNorm,
    chatTitle:
      entity?.title ||
      [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() ||
      resolved.title ||
      resolved.username,
    messageId: msg.id ?? "",
    date: normalizeDate(msg.date),
    text: msg.message || "",
    views: msg.views ?? 0,
    senderId: msg.senderId?.toString?.() ?? null,
    authorName: senderInfo.authorName,
    username: senderInfo.username,
    phone: senderInfo.phone,
    avatarUrl: null,
    postLink: messageLink,
    link: messageLink,
    mediaType,
    mediaUrl: cachedMedia.mediaUrl || null,
    thumbnail: cachedMedia.thumbnail || null,
    previewUrl: cachedMedia.previewUrl || null,
    media: {
      hasMedia: Boolean(mediaType),
      mediaType: mediaType || null,
      mediaUrl: cachedMedia.mediaUrl || null,
      thumbnail: cachedMedia.thumbnail || null,
      previewUrl: cachedMedia.previewUrl || null,
      hasThumbnail: Boolean(cachedMedia.hasThumbnail),
      existsOnDisk: Boolean(cachedMedia.existsOnDisk),
      downloadStatus: cachedMedia.downloadStatus || (mediaType ? "deferred_v70_fast_stream" : "none"),
      isPreviewable: mediaType === "photo" || mediaType === "video",
      previewMode: mediaType === "photo" ? "image" : (mediaType === "video" ? "video" : "none"),
    },
    sourceKind: "public",
    publicReference: resolved.normalizedRef,
    ...extractForwardInfo(msg),
  };
}

function cachedPublicMessageMedia(chatId, messageId, mediaType) {
  const response = { mediaUrl: null, thumbnail: null, previewUrl: null, hasThumbnail: false, existsOnDisk: false, downloadStatus: mediaType ? "deferred_cached_check" : "none" };
  try {
    if (!mediaType) return response;
    const baseName = `${safeFileName(chatId)}_${safeFileName(messageId)}`;
    const candidates = [];
    if (mediaType === "photo") candidates.push({ file: path.join(MEDIA_DIRS.photos, `${baseName}.jpg`), kind: "photo" });
    if (mediaType === "video") { candidates.push({ file: path.join(MEDIA_DIRS.videos, `${baseName}.mp4`), kind: "video" }); candidates.push({ file: path.join(MEDIA_DIRS.thumbs, `${baseName}.jpg`), kind: "thumb" }); }
    if (mediaType === "audio" || mediaType === "voice") candidates.push({ file: path.join(MEDIA_DIRS.audio, `${baseName}.ogg`), kind: "audio" });
    if (["pdf", "document", "sticker"].includes(mediaType)) {
      for (const ext of [".pdf", ".bin", ".webp", ".jpg", ".png"]) candidates.push({ file: path.join(MEDIA_DIRS.documents, `${baseName}${ext}`), kind: "document" });
    }
    for (const c of candidates) {
      if (!fs.existsSync(c.file)) continue;
      const url = publicUrlFromAbsolute(c.file);
      response.existsOnDisk = true;
      response.downloadStatus = "cached";
      if (c.kind === "thumb") { response.thumbnail = url; response.previewUrl = response.previewUrl || url; response.hasThumbnail = true; }
      else { response.mediaUrl = response.mediaUrl || url; response.previewUrl = response.previewUrl || url; if (mediaType === "photo") { response.thumbnail = response.thumbnail || url; response.hasThumbnail = true; } }
    }
  } catch {}
  return response;
}

export async function downloadPublicMessageMedia(reference = "", messageId = "") {
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await getResolvedPublicEntity(tg, resolved);
  const id = Number(messageId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("ID da mensagem pública inválido.");
  let messages = await tg.getMessages(entity, { ids: [id] });
  if (!Array.isArray(messages)) messages = messages ? [messages] : [];
  const msg = messages.find(Boolean);
  if (!msg) throw new Error("Mensagem pública não localizada para baixar mídia.");
  const item = await enrichPublicMessage(entity, resolved, msg);
  return { ok: true, item, media: item.media || {}, mediaUrl: item.mediaUrl || item.media?.mediaUrl || null, thumbnail: item.thumbnail || item.media?.thumbnail || null, previewUrl: item.previewUrl || item.media?.previewUrl || null, link: item.link || item.postLink || null };
}

export async function downloadPublicMessageThumbnail(reference = "", messageId = "") {
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await getResolvedPublicEntity(tg, resolved);
  const id = Number(messageId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("ID da mensagem pública inválido.");
  let messages = await tg.getMessages(entity, { ids: [id] });
  if (!Array.isArray(messages)) messages = messages ? [messages] : [];
  const msg = messages.find(Boolean);
  if (!msg) throw new Error("Mensagem pública não localizada para baixar miniatura.");
  const mediaType = detectMediaType(msg);
  const chatIdNorm = normalizeChatId(entity, resolved);
  const baseName = `${safeFileName(chatIdNorm)}_${safeFileName(msg.id)}`;
  const thumbFile = path.join(MEDIA_DIRS.thumbs, `${baseName}.jpg`);
  const response = { ok: true, mediaType, mediaUrl: null, previewUrl: null, thumbnail: null, hasThumbnail: false };
  try {
    if (!ensureThumbValid(thumbFile)) await tryDownloadMediaThumb(tg, msg, thumbFile);
    if (ensureThumbValid(thumbFile)) {
      response.thumbnail = publicUrlFromAbsolute(thumbFile);
      response.previewUrl = response.thumbnail;
      response.hasThumbnail = true;
      return response;
    }
  } catch {}
  if (mediaType === "photo" || mediaType === "sticker") {
    const media = await ensurePublicMessageMedia(tg, chatIdNorm, msg, mediaType);
    response.mediaUrl = media.mediaUrl;
    response.previewUrl = media.previewUrl || media.mediaUrl;
    response.thumbnail = media.thumbnail || media.previewUrl || media.mediaUrl;
    response.hasThumbnail = Boolean(response.thumbnail);
  }
  return response;
}


async function enrichPublicMessage(entity, resolved, msg) {
  const tg = await startTelegram();
  const senderInfo = await extractSenderFields(msg);
  const sender = await msg.getSender().catch(() => null);
  const mediaType = detectMediaType(msg);
  const chatIdNorm = normalizeChatId(entity, resolved);
  const media = await ensurePublicMessageMedia(tg, chatIdNorm, msg, mediaType);
  const avatarUrl = await ensureAvatarForSender(sender);

  const messageLink = `https://t.me/${resolved.username}/${msg.id}`;
  return {
    chatId: chatIdNorm,
    chatTitle:
      entity?.title ||
      [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() ||
      resolved.title ||
      resolved.username,
    messageId: msg.id ?? "",
    date: normalizeDate(msg.date),
    text: msg.message || "",
    views: msg.views ?? 0,
    senderId: msg.senderId?.toString?.() ?? null,
    authorName: senderInfo.authorName,
    username: senderInfo.username,
    phone: senderInfo.phone,
    avatarUrl,
    postLink: messageLink,
    link: messageLink,
    mediaType,
    mediaUrl: media.mediaUrl || null,
    thumbnail: media.thumbnail || null,
    previewUrl: media.previewUrl || null,
    media,
    sourceKind: "public",
    publicReference: resolved.normalizedRef,
    ...extractForwardInfo(msg),
  };
}

export async function resolvePublicReference(reference = "") {
  const tg = await startTelegram();
  const parsed = normalizePublicReference(reference);
  const entity = await tg.getEntity(parsed.username);

  return {
    ok: true,
    reference: parsed.raw,
    normalizedRef: parsed.normalizedRef,
    username: entity?.username || parsed.username,
    title:
      entity?.title ||
      [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() ||
      parsed.username,
    id:
      entity?.id?.toString?.() ??
      entity?.channelId?.toString?.() ??
      entity?.chatId?.toString?.() ??
      entity?.userId?.toString?.() ??
      "",
    isChannel: Boolean(entity?.broadcast || entity?.megagroup || entity?.className === "Channel"),
    isGroup: Boolean(entity?.megagroup || entity?.className === "Chat"),
    isUser: Boolean(entity?.className === "User"),
    messageHint: parsed.messageHint,
  };
}

async function getResolvedPublicEntity(tg, resolved) {
  try {
    return await tg.getEntity(resolved.username);
  } catch (error) {
    const msg = String(error?.errorMessage || error?.message || "");
    if (/USERNAME_INVALID/i.test(msg)) {
      throw new Error(`Referência pública inválida ou sem username público resolvível: @${resolved.username}.`);
    }
    throw error;
  }
}

async function mapWithConcurrency(items = [], limit = 6, worker = async (item) => item) {
  const source = Array.from(items || []);
  const output = new Array(source.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= source.length) return;
      output[index] = await worker(source[index], index);
    }
  }

  const size = Math.max(1, Math.min(Number(limit) || 1, source.length || 1));
  await Promise.all(Array.from({ length: size }, () => runner()));
  return output;
}

async function fetchPublicMessagesInternal(reference = "", limit = 50) {
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await getResolvedPublicEntity(tg, resolved);
  const messages = await tg.getMessages(entity, { limit: Number(limit) });
  const enriched = await mapWithConcurrency(messages, 6, (msg) => enrichPublicMessage(entity, resolved, msg));
  return { tg, resolved, entity, messages, enriched };
}

export async function getPublicMessages(reference = "", limit = 50, options = {}) {
  const { resolved, enriched } = await fetchPublicMessagesInternal(reference, limit);
  const filtered = applyMessageFilters(enriched, options);

  return {
    meta: buildMeta(filtered, options, "public_messages", {
      publicReference: resolved.normalizedRef,
      publicTitle: resolved.title,
      publicId: resolved.id,
    }),
    items: filtered,
    public: resolved,
  };
}

export async function streamPublicMessages(reference = "", limit = 50, options = {}, onEvent = null) {
  const notify = typeof onEvent === "function" ? onEvent : null;
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await getResolvedPublicEntity(tg, resolved);
  const messages = await tg.getMessages(entity, { limit: Number(limit) });
  notify?.({ type: "start", query: reference, totalReferences: 1, chatTitle: resolved.title, public: resolved, total: messages.length, v65FastPublicStream: true });
  const total = Math.max(1, messages.length);
  const emitted = [];
  let processed = 0;
  for (const msg of messages) {
    const item = await enrichPublicMessageLight(entity, resolved, msg);
    processed += 1;
    emitted.push(item);
    const filteredNow = applyMessageFilters([item], options);
    if (filteredNow.length) notify?.({ type: "item", item: filteredNow[0], progress: { processed, total, percent: Math.min(95, Math.round((processed / total) * 95)), phase: "public_messages_fast_v65" } });
    notify?.({ type: "progress", percent: Math.min(95, Math.round((processed / total) * 95)), processed, total, phase: `Carregando mensagens públicas... ${processed}/${total}`, v65FastPublicStream: true });
  }
  const filtered = applyMessageFilters(emitted, options);
  notify?.({ type: "progress", percent: 100, processed: filtered.length, total: total, phase: `Mensagens públicas carregadas... ${filtered.length}/${total}`, v65FastPublicStream: true });
  notify?.({ type: "end", items: filtered, meta: buildMeta(filtered, options, "public_messages", { publicReference: resolved.normalizedRef, publicTitle: resolved.title, publicId: resolved.id, v65FastPublicStream: true }) });
  return { meta: buildMeta(filtered, options, "public_messages", { publicReference: resolved.normalizedRef, publicTitle: resolved.title, publicId: resolved.id, v65FastPublicStream: true }), items: filtered, public: resolved };
}

export async function streamSearchPublicMessages(reference = "", query = "", limit = 100, options = {}, onEvent = null) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) throw new Error("Termo de busca não informado.");
  const notify = typeof onEvent === "function" ? onEvent : null;
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await getResolvedPublicEntity(tg, resolved);
  const messages = await tg.getMessages(entity, { limit: Number(limit) });
  notify?.({ type: "start", query: term, totalReferences: 1, chatTitle: resolved.title, public: resolved, total: messages.length });
  const total = Math.max(1, messages.length);
  const ordered = new Array(messages.length);
  const collected = [];
  let processed = 0;
  let nextEmit = 0;
  await mapWithConcurrency(messages, 10, async (msg, idx) => {
    // PATCH V68: busca pública em streaming emite metadados antes de baixar mídia/avatar.
    // Isso evita gargalo e miniaturas quebradas durante a renderização inicial.
    const item = await enrichPublicMessageLight(entity, resolved, msg);
    ordered[idx] = { msg, item };
    processed += 1;
    while (nextEmit < ordered.length && ordered[nextEmit] !== undefined) {
      const ready = ordered[nextEmit];
      if (matchesPublicTerm(ready.msg, ready.item, term)) {
        collected.push(ready.item);
        notify?.({ type: "item", item: ready.item });
      }
      nextEmit += 1;
    }
    notify?.({ type: "progress", percent: Math.min(95, Math.round((processed / total) * 95)), processed, total, phase: `Buscando mensagens públicas... ${processed}/${total}` });
    return item;
  });
  const filtered = applyMessageFilters(collected, { ...options, text: options.text || query });
  notify?.({ type: "progress", percent: 100, processed: filtered.length, total: total, phase: `Busca pública concluída... ${filtered.length}/${total}` });
  notify?.({ type: "end", items: filtered, meta: buildMeta(filtered, { ...options, query }, "public_search", { publicReference: resolved.normalizedRef, publicTitle: resolved.title, publicId: resolved.id }) });
  return {
    meta: buildMeta(filtered, { ...options, query }, "public_search", {
      publicReference: resolved.normalizedRef,
      publicTitle: resolved.title,
      publicId: resolved.id,
    }),
    items: filtered,
    public: resolved,
  };
}


/* PATCH V66 - reabilita export usado por routes/auth.js */
export async function searchPublicMessages(reference = "", query = "", limit = 100, options = {}) {
  return await streamSearchPublicMessages(reference, query, limit, options, null);
}

function uniqBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function collectOwnedPublicPeerKeys(tg) {
  const dialogs = await tg.getDialogs({});
  const ownedIds = new Set();
  const ownedUsernames = new Set();

  for (const dialog of dialogs || []) {
    const entity = dialog?.entity || null;
    const normalized = normalizeUniversalReferenceEntity(entity || {});
    const dialogId = dialog?.id?.toString?.() || "";

    if (dialogId) ownedIds.add(dialogId);
    if (normalized.id) ownedIds.add(String(normalized.id));
    if (entity?.id?.toString?.()) ownedIds.add(entity.id.toString());
    if (entity?.channelId?.toString?.()) ownedIds.add(entity.channelId.toString());
    if (entity?.chatId?.toString?.()) ownedIds.add(entity.chatId.toString());
    if (entity?.userId?.toString?.()) ownedIds.add(entity.userId.toString());

    const username = String(entity?.username || normalized.username || "").trim().toLowerCase();
    if (username) {
      ownedUsernames.add(username);
      ownedUsernames.add(`@${username}`);
    }
  }

  return { ownedIds, ownedUsernames };
}

function normalizeUniversalReferenceEntity(entity) {
  const username = entity?.username || null;
  const normalizedRef = username ? `@${username}` : null;
  return {
    id:
      entity?.id?.toString?.() ??
      entity?.channelId?.toString?.() ??
      entity?.chatId?.toString?.() ??
      entity?.userId?.toString?.() ??
      "",
    username,
    normalizedRef,
    title:
      entity?.title ||
      [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() ||
      username ||
      "(sem título)",
    isChannel: Boolean(entity?.broadcast || entity?.className === "Channel"),
    isGroup: Boolean(entity?.megagroup || entity?.className === "Chat"),
    isUser: Boolean(entity?.className === "User"),
  };
}

export async function discoverPublicReferences(query = "", limit = 20) {
  const tg = await startTelegram();
  const term = String(query || "").trim();
  if (!term) throw new Error("Termo de busca não informado.");

  const candidates = [];

  try {
    const found = await tg.invoke(new Api.contacts.Search({ q: term, limit: Math.max(Number(limit) * 3, 50) }));
    const users = found?.users || [];
    const chats = found?.chats || [];
    for (const entity of [...users, ...chats]) {
      const normalized = normalizeUniversalReferenceEntity(entity);
      if (normalized.username && (normalized.isChannel || normalized.isGroup || normalized.isUser)) candidates.push(normalized);
    }
  } catch {}

  const references = uniqBy(candidates, (item) => item.normalizedRef || item.id).slice(0, Number(limit));
  return { references, items: references, meta: { operation: "public_universal_references", total: references.length, generatedAt: new Date().toISOString(), query: term } };
}

export async function searchPublicMessagesUniversalStream(query = "", config = {}) {
  const tg = await startTelegram();
  const term = String(query || "").trim();
  if (!term) throw new Error("Termo de busca não informado.");

  const limit = Number(config.limit || 100);
  const filters = { ...(config.filters || {}) };
  delete filters.author;
  delete filters.username;
  delete filters.phone;
  delete filters.text;
  const onEvent = typeof config.onEvent === "function" ? config.onEvent : null;

  onEvent?.({ type: "start", totalReferences: 1, query: term });

  const { ownedIds, ownedUsernames } = await collectOwnedPublicPeerKeys(tg);
  const results = [];
  const seenKeys = new Set();

  let totalScanned = 0;
  let offsetRate = 0;
  let offsetPeer = new Api.InputPeerEmpty();
  let offsetId = 0;
  const maxPages = 12;
  const pageLimit = Math.min(Math.max(limit * 3, 100), 100);

  try {
    for (let page = 0; page < maxPages && results.length < limit; page += 1) {
      const global = await tg.invoke(new Api.messages.SearchGlobal({
        q: term,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate,
        offsetPeer,
        offsetId,
        limit: pageLimit,
      }));

      const entityMap = new Map();
      for (const c of [...(global?.chats || []), ...(global?.users || [])]) {
        const key = c?.id?.toString?.() ?? c?.channelId?.toString?.() ?? c?.chatId?.toString?.() ?? c?.userId?.toString?.();
        if (key) entityMap.set(key, c);
      }

      const rawMessages = global?.messages || [];
      if (!rawMessages.length) break;
      totalScanned += rawMessages.length;

      for (let i = 0; i < rawMessages.length; i += 1) {
        const msg = rawMessages[i];
        const peerId = msg?.peerId?.channelId?.toString?.() ?? msg?.peerId?.chatId?.toString?.() ?? msg?.peerId?.userId?.toString?.() ?? null;
        const entity = peerId ? entityMap.get(peerId) : null;
        const normalized = normalizeUniversalReferenceEntity(entity || {});
        const resolved = {
          username: entity?.username || normalized.username || null,
          normalizedRef: entity?.username ? `@${entity.username}` : (normalized.normalizedRef || null),
          title: normalized.title || '(sem título)',
          id: normalized.id || peerId || '',
        };
        const item = await enrichPublicMessage(entity, resolved, msg);

        const normalizedUsername = String(resolved.username || normalized.username || '').trim().toLowerCase();
        const normalizedRef = String(resolved.normalizedRef || normalized.normalizedRef || '').trim().toLowerCase();
        const normalizedChatId = String(resolved.id || normalized.id || item?.chatId || peerId || '').trim();
        const belongsToAccount =
          (normalizedChatId && ownedIds.has(normalizedChatId)) ||
          (normalizedUsername && (ownedUsernames.has(normalizedUsername) || ownedUsernames.has(`@${normalizedUsername}`))) ||
          (normalizedRef && ownedUsernames.has(normalizedRef));

        if (belongsToAccount) continue;
        if (!matchesPublicTerm(msg, item, term)) continue;

        const dedupeKey = `${item.chatId || ''}:${item.messageId || ''}:${item.postLink || ''}`;
        if (!dedupeKey || seenKeys.has(dedupeKey)) continue;

        seenKeys.add(dedupeKey);
        results.push(item);
        onEvent?.({ type: 'item', item });

        if (results.length >= limit) break;
      }

      onEvent?.({
        type: 'progress',
        phase: `Buscando termo no conteúdo público... ${Math.min(results.length, limit)}/${limit}`,
        percent: Math.min(99, Math.round((page + 1) * (100 / maxPages))),
      });

      if (results.length >= limit) break;

      const lastMsg = rawMessages[rawMessages.length - 1];
      const lastPeerId = lastMsg?.peerId?.channelId?.toString?.() ?? lastMsg?.peerId?.chatId?.toString?.() ?? lastMsg?.peerId?.userId?.toString?.() ?? null;
      const nextRate = Number(global?.nextRate ?? global?.next_rate ?? 0);

      if (!lastMsg || !lastPeerId) break;

      offsetId = Number(lastMsg?.id || 0);
      offsetRate = Number.isFinite(nextRate) ? nextRate : 0;

      try {
        offsetPeer = await tg.getInputEntity(entityMap.get(lastPeerId) || lastPeerId);
      } catch {
        offsetPeer = new Api.InputPeerEmpty();
      }

      if (!offsetId) break;
    }
  } catch (error) {
    onEvent?.({ type: "error", error: `Falha na busca pública global: ${error.message}` });
  }

  const filtered = applyMessageFilters(results, filters).slice(0, limit);
  onEvent?.({ type: 'progress', phase: `Buscando termo no conteúdo público... ${filtered.length}/${limit}`, percent: 100 });
  onEvent?.({ type: 'end', total: filtered.length, totalReferences: totalScanned });
  return {
    meta: buildMeta(filtered, { ...filters, query: term }, 'public_universal_search', { publicReference: 'universal', publicTitle: 'fontes públicas externas' }),
    items: filtered,
    references: [],
  };
}
