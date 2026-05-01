import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import input from "input";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE = path.join(__dirname, "../session.txt");
const PUBLIC_DIR = path.join(__dirname, "../public");
const CACHE_DIR = path.join(PUBLIC_DIR, "cache");
const AVATAR_DIR = path.join(CACHE_DIR, "avatars");
const MEDIA_ROOT_DIR = path.join(CACHE_DIR, "media");
const MEDIA_DIRS = {
  photos: path.join(MEDIA_ROOT_DIR, "photos"),
  videos: path.join(MEDIA_ROOT_DIR, "videos"),
  audio: path.join(MEDIA_ROOT_DIR, "audio"),
  documents: path.join(MEDIA_ROOT_DIR, "documents"),
  thumbs: path.join(MEDIA_ROOT_DIR, "thumbs"),
  unknown: path.join(MEDIA_ROOT_DIR, "unknown"),
};

let client = null;
let clientPromise = null;
let chatsCache = null;
let chatsCacheTs = 0;
let chatsCachePromise = null;

function chatsDiskCachePath() {
  return path.join(__dirname, "../.telegram_chats_cache.json");
}

function readChatsDiskCache() {
  try {
    const filePath = chatsDiskCachePath();
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed?.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeChatsDiskCache(items = []) {
  try {
    fs.writeFileSync(
      chatsDiskCachePath(),
      JSON.stringify({ items, fetchedAt: Date.now() }, null, 2),
      "utf-8"
    );
  } catch {}
}

function withTimeout(promise, ms, fallbackValue) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallbackValue);
    }, ms);

    promise.then((value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(CACHE_DIR);
ensureDir(AVATAR_DIR);
Object.values(MEDIA_DIRS).forEach(ensureDir);



// PATCH FASE 3 MIDIA REAL — valida cache e evita arquivo vazio/corrompido.
function fileSizeSafe(filePath) {
  try { return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0; } catch { return 0; }
}
function minExpectedMediaBytes(mediaType) {
  if (mediaType === "photo" || mediaType === "sticker") return 512;
  if (mediaType === "video") return 16 * 1024;
  if (mediaType === "audio" || mediaType === "voice") return 1024;
  return 1;
}
function cachedMediaIsValid(filePath, mediaType) {
  return fileSizeSafe(filePath) >= minExpectedMediaBytes(mediaType);
}
function removeInvalidCachedMedia(filePath, mediaType) {
  try {
    if (fs.existsSync(filePath) && !cachedMediaIsValid(filePath, mediaType)) fs.unlinkSync(filePath);
  } catch {}
}
async function downloadMediaWithRetry(tg, msg, outputFile, mediaType) {
  removeInvalidCachedMedia(outputFile, mediaType);
  if (cachedMediaIsValid(outputFile, mediaType)) return true;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await tg.downloadMedia(msg, { outputFile });
      if (cachedMediaIsValid(outputFile, mediaType)) return true;
      removeInvalidCachedMedia(outputFile, mediaType);
    } catch (error) {
      lastError = error;
      removeInvalidCachedMedia(outputFile, mediaType);
    }
  }
  if (lastError) throw lastError;
  return false;
}
function ensureThumbValid(thumbFile) {
  try { if (fs.existsSync(thumbFile) && fs.statSync(thumbFile).size < 256) fs.unlinkSync(thumbFile); } catch {}
  return fileSizeSafe(thumbFile) >= 256;
}

function loadSession() {
  try {
    return fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, "utf-8").trim() : "";
  } catch {
    return "";
  }
}

function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, session, "utf-8");
}

function clearSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch {}
}

function isAuthKeyUnregisteredError(error) {
  const message = String(error?.errorMessage || error?.message || "").toUpperCase();
  return Number(error?.code) === 401 || message.includes("AUTH_KEY_UNREGISTERED");
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sortChatsAlpha(items = []) {
  return [...items].sort((a, b) =>
    String(a?.title || "").localeCompare(String(b?.title || ""), "pt-BR", { sensitivity: "base" })
  );
}


function safeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function publicUrlFromAbsolute(filePath) {
  const relative = path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/");
  return `/${relative}`;
}

async function buildAndStartClient(sessionValue = "") {
  dotenv.config({ override: true });

  const apiId = Number(process.env.API_ID);
  const apiHash = process.env.API_HASH;

  if (!apiId || !apiHash) {
    throw new Error("API_ID ou API_HASH não definidos.");
  }

  const stringSession = new StringSession(sessionValue);
  const tg = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await tg.start({
    phoneNumber: async () => await input.text("Número (+55...): "),
    password: async () => await input.text("Senha (se houver): "),
    phoneCode: async () => await input.text("Código recebido: "),
    onError: (err) => console.log("TELEGRAM_LOGIN_ERROR =", err),
  });

  saveSession(tg.session.save());
  return tg;
}

export async function startTelegram() {
  if (client) return client;
  if (clientPromise) return await clientPromise;

  clientPromise = (async () => {
    const storedSession = loadSession();

    try {
      const tg = await buildAndStartClient(storedSession);
      client = tg;
      return tg;
    } catch (error) {
      if (storedSession && isAuthKeyUnregisteredError(error)) {
        console.warn("Sessão inválida detectada. Limpando session.txt e solicitando novo login...");
        clearSession();

        const tg = await buildAndStartClient("");
        client = tg;
        return tg;
      }

      throw error;
    }
  })();

  try {
    return await clientPromise;
  } finally {
    clientPromise = null;
  }
}

export async function resetTelegramSession() {
  try {
    if (client) {
      try {
        await client.disconnect();
      } catch {}
    }
  } finally {
    client = null;
    clientPromise = null;
    clearSession();
  }

  return { ok: true, message: "Sessão removida. Faça login novamente." };
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

  try {
    if (typeof value === "object" && typeof value.valueOf === "function") {
      const raw = value.valueOf();
      if (raw instanceof Date) return raw.toISOString();
      if (typeof raw === "number") {
        const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
        return new Date(ms).toISOString();
      }
    }
  } catch {}

  return null;
}

function normalizeChatId(rawChatId, fallbackEntity) {
  if (rawChatId !== undefined && rawChatId !== null && String(rawChatId).trim()) {
    return String(rawChatId);
  }

  const candidate =
    fallbackEntity?.id ??
    fallbackEntity?.peerId?.channelId ??
    fallbackEntity?.peerId?.chatId ??
    fallbackEntity?.peerId?.userId;

  return candidate === undefined || candidate === null ? "" : String(candidate);
}

async function extractSenderFields(msg) {
  let authorName = null;
  let username = null;
  let phone = null;
  let sender = null;

  try {
    sender = await msg.getSender();
    if (sender) {
      authorName =
        sender.title ||
        [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() ||
        null;
      username = sender.username || null;
      phone = sender.phone || null;
    }
  } catch {}

  return { authorName, username, phone, sender };
}


function readJpegSize(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (!marker || marker === 0xD9 || marker === 0xDA) break;
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) break;
    const isSOF = [0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker);
    if (isSOF && offset + 8 < buffer.length) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + size;
  }
  return null;
}

function readPngSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const pngSig = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSig) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readImageSize(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return readJpegSize(buffer) || readPngSize(buffer);
  } catch {
    return null;
  }
}

function avatarNeedsRefresh(filePath) {
  try {
    if (!fs.existsSync(filePath)) return true;
    const stats = fs.statSync(filePath);
    if (!stats.size || stats.size < 8 * 1024) return true;
    const size = readImageSize(filePath);
    if (!size) return true;
    if (size.width < 300 || size.height < 300) return true;
    return false;
  } catch {
    return true;
  }
}

async function ensureAvatarForSender(tg, sender) {
  if (!sender) return null;

  const senderId =
    sender.id?.toString?.() ??
    sender.userId?.toString?.() ??
    sender.channelId?.toString?.() ??
    sender.chatId?.toString?.() ??
    null;

  if (!senderId || !sender.photo) return null;

  const outputFile = path.join(AVATAR_DIR, `sender_${senderId}.jpg`);
  const publicUrl = `/cache/avatars/sender_${senderId}.jpg`;

  const needsRefresh = avatarNeedsRefresh(outputFile);
  if (!needsRefresh && fs.existsSync(outputFile)) return publicUrl;

  const tempFile = path.join(AVATAR_DIR, `sender_${senderId}__tmp.jpg`);

  try {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
    await tg.downloadProfilePhoto(sender, { isBig: true, outputFile: tempFile });

    if (fs.existsSync(tempFile)) {
      const tempIsGood = !avatarNeedsRefresh(tempFile);
      if (tempIsGood || !fs.existsSync(outputFile)) {
        try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch {}
        fs.renameSync(tempFile, outputFile);
      } else {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }

    if (fs.existsSync(outputFile)) return publicUrl;
  } catch {}

  try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
  return fs.existsSync(outputFile) ? publicUrl : null;
}

function memberAvatarIsUsable(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (!stats.size || stats.size < 256) return false;
    const size = readImageSize(filePath);
    return Boolean(size && size.width >= 24 && size.height >= 24);
  } catch {
    return false;
  }
}

async function ensureAvatarForMember(tg, member) {
  if (!member) return null;
  const memberId =
    member.id?.toString?.() ??
    member.userId?.toString?.() ??
    member.channelId?.toString?.() ??
    member.chatId?.toString?.() ??
    null;
  if (!memberId || !member.photo) return null;

  const outputFile = path.join(AVATAR_DIR, `member_${memberId}.jpg`);
  const publicUrl = `/cache/avatars/member_${memberId}.jpg`;
  if (memberAvatarIsUsable(outputFile)) return publicUrl;

  const attempts = [
    { isBig: true, outputFile },
    { isBig: false, outputFile },
  ];
  for (const opts of attempts) {
    try {
      await tg.downloadProfilePhoto(member, opts);
      if (memberAvatarIsUsable(outputFile)) return publicUrl;
    } catch {}
  }

  return memberAvatarIsUsable(outputFile) ? publicUrl : null;
}

function profileLinkForMember(member, id = "") {
  const username = String(member?.username || "").replace(/^@/, "").trim();
  if (username) return `https://t.me/${username}`;
  const cleanId = String(id || "").trim();
  return cleanId ? `tg://user?id=${encodeURIComponent(cleanId)}` : "";
}


function inspectDocument(msg) {
  const mime = msg.file?.mimeType || msg.document?.mimeType || "";
  const fileName = msg.file?.name || null;
  const ext = path.extname(fileName || "").toLowerCase();
  const attrs = Array.isArray(msg.document?.attributes) ? msg.document.attributes : [];

  const hasVideoAttr = attrs.some((attr) => attr?.className === "DocumentAttributeVideo");
  const hasAudioAttr = attrs.some((attr) => attr?.className === "DocumentAttributeAudio");
  const isVoiceAttr = attrs.some((attr) => attr?.className === "DocumentAttributeAudio" && attr?.voice);
  const isAnimated = attrs.some((attr) => attr?.className === "DocumentAttributeAnimated");
  const isSticker = attrs.some((attr) => attr?.className === "DocumentAttributeSticker");

  return {
    mime,
    fileName,
    ext,
    isPdf: mime.includes("pdf") || ext === ".pdf",
    hasVideoAttr,
    hasAudioAttr,
    isVoiceAttr,
    isAnimated,
    isSticker,
  };
}

function detectMediaType(msg) {
  const doc = inspectDocument(msg);

  if (msg.photo) return "photo";
  if (msg.video || doc.hasVideoAttr || doc.mime.startsWith("video/")) return "video";
  if (msg.voice || doc.isVoiceAttr) return "voice";
  if (msg.audio || (doc.hasAudioAttr && !doc.isVoiceAttr) || doc.mime.startsWith("audio/")) return "audio";
  if (msg.sticker || doc.isSticker || doc.isAnimated) return "sticker";
  if (msg.document && doc.isPdf) return "pdf";
  if (msg.document) return "document";

  return null;
}

function buildPostLink(dialog, msg) {
  const dialogUsername =
    dialog?.entity?.username ||
    dialog?.username ||
    dialog?.title?.username ||
    null;

  return dialogUsername ? `https://t.me/${dialogUsername}/${msg.id}` : null;
}

async function extractForwardInfo(tg, msg) {
  const fwd = msg?.fwdFrom;

  if (!fwd) {
    return {
      isForwarded: false,
      forwardOriginName: null,
      forwardOriginId: null,
      forwardOriginType: null,
      forwardDate: null,
      forwardPostAuthor: null,
      forwardSavedFromPeer: null,
      forwardSavedFromMsgId: null,
      forwardOriginUsername: null,
      forwardOriginLink: null,
      forwardOriginalTitle: null,
      forwardOriginalPage: null,
      forwardOriginalLink: null,
      forwardOriginalDate: null,
    };
  }

  const peerObj = fwd.fromId || fwd.savedFromPeer || null;
  const fromId =
    fwd.fromId?.channelId?.toString?.() ??
    fwd.fromId?.chatId?.toString?.() ??
    fwd.fromId?.userId?.toString?.() ??
    fwd.savedFromPeer?.channelId?.toString?.() ??
    fwd.savedFromPeer?.chatId?.toString?.() ??
    fwd.savedFromPeer?.userId?.toString?.() ??
    null;

  let forwardOriginType = null;
  if (fwd.fromId?.channelId || fwd.savedFromPeer?.channelId) forwardOriginType = "channel";
  else if (fwd.fromId?.chatId || fwd.savedFromPeer?.chatId) forwardOriginType = "group";
  else if (fwd.fromId?.userId || fwd.savedFromPeer?.userId) forwardOriginType = "user";

  let resolved = null;
  try { if (peerObj) resolved = await tg.getEntity(peerObj); } catch {}

  const resolvedName = resolved?.title || [resolved?.firstName, resolved?.lastName].filter(Boolean).join(" ").trim() || null;
  const resolvedUsername = resolved?.username || null;
  const msgId = fwd.channelPost || fwd.savedFromMsgId || null;
  const resolvedLink = resolvedUsername ? `https://t.me/${resolvedUsername}` : null;
  const originalLink = resolvedUsername && msgId ? `https://t.me/${resolvedUsername}/${msgId}` : resolvedLink;

  return {
    isForwarded: true,
    forwardOriginName: fwd.fromName || resolvedName || null,
    forwardOriginId: fromId,
    forwardOriginType,
    forwardDate: normalizeDate(fwd.date),
    forwardPostAuthor: fwd.postAuthor || null,
    forwardSavedFromPeer:
      fwd.savedFromPeer?.channelId?.toString?.() ??
      fwd.savedFromPeer?.chatId?.toString?.() ??
      fwd.savedFromPeer?.userId?.toString?.() ??
      null,
    forwardSavedFromMsgId: fwd.savedFromMsgId ?? null,
    forwardOriginUsername: resolvedUsername,
    forwardOriginLink: resolvedLink,
    forwardOriginalTitle: resolvedName || fwd.fromName || null,
    forwardOriginalPage: resolvedName || fwd.fromName || null,
    forwardOriginalLink: originalLink,
    forwardOriginalDate: normalizeDate(fwd.date),
  };
}

function guessExtension(msg, mediaType) {
  const doc = inspectDocument(msg);

  if (mediaType === "photo") return ".jpg";
  if (mediaType === "video") return ".mp4";
  if (mediaType === "voice") return ".ogg";
  if (mediaType === "audio") return doc.ext || ".mp3";
  if (mediaType === "pdf") return ".pdf";
  if (doc.ext) return doc.ext;

  const mime = doc.mime;
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("mpeg")) return ".mp3";

  return ".bin";
}

function mediaFolderKey(mediaType) {
  if (mediaType === "photo") return "photos";
  if (mediaType === "video") return "videos";
  if (mediaType === "audio" || mediaType === "voice") return "audio";
  if (mediaType === "document" || mediaType === "pdf") return "documents";
  return "unknown";
}

async function tryDownloadMediaThumb(tg, msg, thumbFile) {
  try {
    if (fs.existsSync(thumbFile)) return true;
    await tg.downloadMedia(msg, { outputFile: thumbFile, thumb: -1 });
    return fs.existsSync(thumbFile);
  } catch {
    return false;
  }
}

async function ensureMessageMedia(tg, chatId, msg, mediaType) {
  const hasMedia = Boolean(mediaType);
  const doc = inspectDocument(msg);
  const mimeType = doc.mime || msg.file?.mimeType || null;
  const fileName = doc.fileName || null;
  const ext = guessExtension(msg, mediaType);
  const folderKey = mediaFolderKey(mediaType);
  const baseName =
    safeFileName(`chat_${String(chatId).replace(/[^\d-]/g, "_")}_msg_${msg.id}`) ||
    `msg_${msg.id}`;
  const outputFile = path.join(MEDIA_DIRS[folderKey], `${baseName}${ext}`);
  const thumbFile = path.join(MEDIA_DIRS.thumbs, `${baseName}.jpg`);

  const response = {
    hasMedia,
    mediaType: mediaType || null,
    mimeType,
    fileName,
    extension: ext,
    size: msg.file?.size ?? null,
    localPath: null,
    mediaUrl: null,
    previewUrl: null,
    thumbnailPath: null,
    thumbnail: null,
    hasThumbnail: false,
    downloadStatus: hasMedia ? "deferred" : "none",
    downloadError: null,
    existsOnDisk: false,
    isPreviewable: false,
    previewMode: "none",
    detectedButFailed: false,
  };

  if (!hasMedia) return response;

  if (mediaType === "photo") {
    response.isPreviewable = true;
    response.previewMode = "image";
  } else if (mediaType === "video") {
    response.isPreviewable = true;
    response.previewMode = "video";
  } else if (mediaType === "pdf") {
    response.isPreviewable = true;
    response.previewMode = "pdf";
  }

  try {
    const downloadableTypes = ["photo", "video", "audio", "voice", "pdf", "document", "sticker"];

    if (downloadableTypes.includes(mediaType)) {
      try {
        await downloadMediaWithRetry(tg, msg, outputFile, mediaType);
      } catch (error) {
        response.downloadStatus = "failed";
        response.detectedButFailed = true;
        response.downloadError = error?.message || "Falha ao baixar mídia.";
      }
    }

    if (cachedMediaIsValid(outputFile, mediaType)) {
      response.localPath = outputFile;
      response.mediaUrl = publicUrlFromAbsolute(outputFile);
      response.existsOnDisk = true;
      response.downloadStatus = "success";
    }

    if (mediaType === "photo" && response.mediaUrl) {
      response.previewUrl = response.mediaUrl;
      response.thumbnailPath = response.localPath;
      response.thumbnail = response.mediaUrl;
      response.hasThumbnail = true;
      return response;
    }

    if (mediaType === "video") {
      if (!ensureThumbValid(thumbFile)) {
        try {
          await tryDownloadMediaThumb(tg, msg, thumbFile);
        } catch {}
      }
      if (ensureThumbValid(thumbFile)) {
        response.thumbnailPath = thumbFile;
        response.thumbnail = publicUrlFromAbsolute(thumbFile);
        response.previewUrl = response.thumbnail;
        response.hasThumbnail = true;
      } else {
        response.previewUrl = null;
      }
      return response;
    }

    if (["pdf", "document", "sticker"].includes(mediaType) && fs.existsSync(thumbFile)) {
      response.thumbnailPath = thumbFile;
      response.thumbnail = publicUrlFromAbsolute(thumbFile);
      response.previewUrl = response.thumbnail;
      response.hasThumbnail = true;
    }
  } catch (error) {
    response.downloadStatus = "failed";
    response.detectedButFailed = true;
    response.downloadError = error?.message || "Falha ao verificar cache de mídia.";
  }

  return response;
}



// PATCH V56 — proteção contra travamento na fase final da carga de mensagens.
// Alguns downloads de avatar/mídia do Telegram podem ficar pendentes por tempo indeterminado.
// A grade não deve aguardar uma mídia problemática para concluir a consulta.
function mediaPlaceholderForMessage(msg, mediaType) {
  return {
    hasMedia: Boolean(mediaType),
    mediaType: mediaType || null,
    mimeType: null,
    fileName: null,
    extension: mediaType ? guessExtension(msg, mediaType) : null,
    size: msg?.file?.size ?? null,
    localPath: null,
    mediaUrl: null,
    previewUrl: null,
    thumbnailPath: null,
    thumbnail: null,
    hasThumbnail: false,
    downloadStatus: mediaType ? "deferred" : "none",
    downloadError: null,
    existsOnDisk: false,
    isPreviewable: mediaType === "photo" || mediaType === "video" || mediaType === "pdf",
    previewMode: mediaType === "photo" ? "image" : (mediaType === "video" ? "video" : (mediaType === "pdf" ? "pdf" : "none")),
    detectedButFailed: false,
  };
}

async function promiseWithTimeout(promise, ms, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function enrichMessageSafe(tg, dialog, msg, requestedChatId = "", opts = {}) {
  const chatId = normalizeChatId(requestedChatId, dialog);
  const chatTitle = dialog?.title || dialog?.name || dialog?.username || "";
  const mediaType = detectMediaType(msg);
  const base = {
    chatId,
    chatTitle,
    messageId: msg?.id ?? "",
    date: normalizeDate(msg?.date),
    text: msg?.message || "",
    views: msg?.views ?? 0,
    senderId: msg?.senderId?.toString?.() ?? null,
    authorName: "",
    username: null,
    phone: null,
    avatarUrl: null,
    postLink: buildPostLink(dialog, msg),
    mediaType,
    mediaUrl: null,
    thumbnail: null,
    previewUrl: null,
    media: mediaPlaceholderForMessage(msg, mediaType),
    sourceKind: "internal",
  };

  const timeoutMs = Number(opts?.timeoutMs || 7000);
  try {
    const enriched = await promiseWithTimeout(enrichMessage(tg, dialog, msg, requestedChatId, opts), timeoutMs, null);
    return enriched || { ...base, enrichmentTimedOut: true };
  } catch (error) {
    return { ...base, enrichmentError: error?.message || "Falha ao enriquecer mensagem." };
  }
}

async function enrichMessage(tg, dialog, msg, requestedChatId = "", opts = {}) {
  const { authorName, username, phone, sender } = await extractSenderFields(msg);
  const avatarUrl = opts.light ? null : await promiseWithTimeout(ensureAvatarForSender(tg, sender), Number(opts.avatarTimeoutMs || 1200), null);
  const chatId = normalizeChatId(requestedChatId, dialog);
  const chatTitle = dialog?.title || dialog?.name || dialog?.username || "";
  const mediaType = detectMediaType(msg);
  const postLink = buildPostLink(dialog, msg);
  const forwardInfo = await promiseWithTimeout(extractForwardInfo(tg, msg), Number(opts.forwardTimeoutMs || 1200), {});
  const media = opts.light ? mediaPlaceholderForMessage(msg, mediaType) : await promiseWithTimeout(ensureMessageMedia(tg, chatId, msg, mediaType), Number(opts.mediaTimeoutMs || 3500), mediaPlaceholderForMessage(msg, mediaType));

  return {
    chatId,
    chatTitle,
    messageId: msg.id ?? "",
    date: normalizeDate(msg.date),
    text: msg.message || "",
    views: msg.views ?? 0,
    senderId: msg.senderId?.toString?.() ?? null,
    authorName,
    username,
    phone,
    avatarUrl,
    postLink,
    mediaType,
    mediaUrl: media.mediaUrl,
    thumbnail: media.thumbnail,
    previewUrl: media.previewUrl,
    media,
    sourceKind: "internal",
    ...forwardInfo,
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

function rawMessagePassesDate(msg, rawOptions = {}) {
  const options = normalizeFilterOptions(rawOptions);
  const msgDate = normalizeDate(msg?.date);
  const msgTs = msgDate ? new Date(msgDate).getTime() : null;
  const fromTs = parseDateInput(options.dateFrom, false);
  const toTs = parseDateInput(options.dateTo, true);
  if (fromTs !== null && msgTs !== null && msgTs < fromTs) return false;
  if (toTs !== null && msgTs !== null && msgTs > toTs) return false;
  return true;
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

    if (options.author) {
      const hay = normalizeText(msg.authorName);
      if (!hay.includes(options.author)) return false;
    }

    if (options.username) {
      const hay = normalizeText(msg.username);
      if (!hay.includes(options.username.replace(/^@/, ""))) return false;
    }

    if (options.phone) {
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

function normalizePublicReference(reference = "") {
  const raw = String(reference || "").trim();
  if (!raw) throw new Error("Referência pública não informada.");

  let normalized = raw;

  normalized = normalized.replace(/^https?:\/\/t\.me\//i, "");
  normalized = normalized.replace(/^https?:\/\/telegram\.me\//i, "");
  normalized = normalized.replace(/^@/, "");
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.split("?")[0];
  normalized = normalized.split("#")[0];

  const parts = normalized.split("/").filter(Boolean);
  const username = parts[0];

  if (!username) throw new Error("Referência pública inválida.");

  return {
    raw,
    username,
    normalizedRef: `@${username}`,
    originalPath: normalized,
    messageHint: parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : null,
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

async function fetchPublicMessagesInternal(reference = "", limit = 50) {
  const tg = await startTelegram();
  const resolved = await resolvePublicReference(reference);
  const entity = await tg.getEntity(resolved.username);
  const messages = await tg.getMessages(entity, { limit: Number(limit) });

  const enriched = [];
  for (const msg of messages) {
    const item = await enrichMessage(tg, entity, msg, resolved.id);
    item.sourceKind = "public";
    item.publicReference = resolved.normalizedRef;
    enriched.push(item);
  }

  return { resolved, enriched };
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

export async function searchPublicMessages(reference = "", query = "", limit = 100, options = {}) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) throw new Error("Termo de busca não informado.");

  const nativePayload = await trySearchMessagesGlobalNative(tg, term, wanted, options, onEvent);
  if (nativePayload) return nativePayload;

  const { resolved, enriched } = await fetchPublicMessagesInternal(reference, limit);
  const base = enriched.filter((msg) => String(msg.text || "").toLowerCase().includes(term));
  const filtered = applyMessageFilters(base, { ...options, text: options.text || query });

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

export async function listChats(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && Array.isArray(chatsCache) && (now - chatsCacheTs) < 5 * 60 * 1000) {
    return chatsCache;
  }

  const diskCache = readChatsDiskCache();

  async function fetchAllDialogsPaginated() {
    const tg = await startTelegram();
    const mapped = [];
    const seen = new Set();

    const addDialog = (dialog) => {
      const id = dialog?.id?.toString?.() ?? dialog?.entity?.id?.toString?.() ?? "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      mapped.push({
        id,
        title: dialog?.title || dialog?.name || dialog?.entity?.title || [dialog?.entity?.firstName, dialog?.entity?.lastName].filter(Boolean).join(" ").trim() || dialog?.entity?.username || "",
        isChannel: Boolean(dialog?.isChannel || dialog?.entity?.broadcast || dialog?.entity?.className === "Channel"),
        isGroup: Boolean(dialog?.isGroup || dialog?.entity?.megagroup || dialog?.entity?.className === "Chat"),
        isUser: Boolean(dialog?.isUser || dialog?.entity?.className === "User"),
        unreadCount: dialog?.unreadCount ?? 0,
        username: dialog?.entity?.username || null,
        isBot: Boolean(dialog?.entity?.bot),
        kind: dialog?.isChannel || dialog?.entity?.broadcast
          ? "channel"
          : dialog?.isGroup || dialog?.entity?.megagroup
          ? "group"
          : dialog?.isUser || dialog?.entity?.className === "User"
          ? (dialog?.entity?.bot ? "bot" : "user")
          : "other",
      });
    };

    for await (const dialog of tg.iterDialogs({})) addDialog(dialog);

    if (!mapped.length) {
      try {
        const fallbackDialogs = await tg.getDialogs({ limit: 500 });
        for (const dialog of fallbackDialogs || []) addDialog(dialog);
      } catch (fallbackError) {
        console.warn("[chats] fallback getDialogs falhou:", fallbackError?.message || fallbackError);
      }
    }

    return sortChatsAlpha(mapped);
  }

  if (!chatsCachePromise) {
    chatsCachePromise = (async () => {
      let bestItems = Array.isArray(diskCache?.items) ? diskCache.items : [];

      try {
        const items = await withTimeout(fetchAllDialogsPaginated(), 120000, null);
        if (Array.isArray(items) && items.length) {
          chatsCache = items;
          chatsCacheTs = Date.now();
          writeChatsDiskCache(items);
          console.log(`[chats] carregados por paginação real: total=${items.length}`);
          return items;
        }
      } catch (error) {
        console.warn("[chats] falha na paginação real:", error?.message || error);
      }

      if (Array.isArray(bestItems) && bestItems.length) {
        console.warn(`[chats] usando cache em disco: total=${bestItems.length}`);
        chatsCache = bestItems;
        chatsCacheTs = Number(diskCache?.fetchedAt || Date.now());
        return bestItems;
      }

      console.warn("[chats] nenhuma conversa retornada; lista vazia.");
      return [];
    })().finally(() => {
      chatsCachePromise = null;
    });
  }

  try {
    const fallbackItems = Array.isArray(diskCache?.items) ? diskCache.items : [];
    const items = await withTimeout(chatsCachePromise, 15000, fallbackItems);
    if (Array.isArray(items) && items.length) {
      chatsCache = items;
      chatsCacheTs = Date.now();
      return items;
    }
    return fallbackItems;
  } catch (error) {
    if (Array.isArray(diskCache?.items) && diskCache.items.length) {
      chatsCache = diskCache.items;
      chatsCacheTs = Number(diskCache.fetchedAt || Date.now());
      console.warn(`[chats] queda no catch final; usando cache em disco: total=${diskCache.items.length}`);
      return diskCache.items;
    }
    console.warn("[chats] catch final sem cache; retornando lista vazia:", error?.message || error);
    return [];
  }
}

export async function getMessages(chatId, limit = 50, options = {}, onEvent = null) {
  const tg = await startTelegram();
  const dialog = await tg.getEntity(chatId);
  const wanted = Math.max(Number(limit || 50), 1);
  const chatTitle = dialog?.title || dialog?.name || dialog?.username || String(chatId || "");
  const useDateScan = Boolean(options?.dateFrom || options?.dateTo);
  const dateFromTs = parseDateInput(options?.dateFrom, false);

  if (typeof onEvent === "function") {
    onEvent({ type: "start", chatId: String(chatId), chatTitle, total: wanted });
  }

  let messages = [];
  if (useDateScan) {
    let scanned = 0;
    const scanCeiling = Math.max(wanted * 5, 1000);
    for await (const msg of tg.iterMessages(dialog)) {
      scanned += 1;
      if (rawMessagePassesDate(msg, options)) {
        messages.push(msg);
      }
      if (typeof onEvent === "function" && (scanned === 1 || scanned % 25 === 0 || messages.length >= wanted)) {
        onEvent({
          type: "progress",
          processed: messages.length,
          scanned,
          total: wanted,
          percent: Math.min(95, Math.round((messages.length / Math.max(wanted, 1)) * 100))
        });
      }
      if (messages.length >= wanted) break;
      if (scanned >= scanCeiling) {
        if (typeof onEvent === "function") {
          onEvent({
            type: "progress",
            processed: messages.length,
            scanned,
            total: Math.max(messages.length, 1),
            percent: 100
          });
        }
        break;
      }
    }
  } else {
    // PATCH FASE3 400MSG: evita limite parcial de getMessages e faz coleta progressiva.
    let collected = 0;
    for await (const msg of tg.iterMessages(dialog, { limit: wanted })) {
      messages.push(msg);
      collected += 1;
      if (typeof onEvent === "function" && (collected === 1 || collected % 25 === 0 || collected >= wanted)) {
        onEvent({
          type: "progress",
          processed: collected,
          collected,
          total: wanted,
          percent: Math.min(95, Math.round((collected / Math.max(wanted, 1)) * 95))
        });
      }
      if (collected >= wanted) break;
    }
  }

  const total = messages.length;
  const prefiltered = messages.filter((msg) => rawMessagePassesDate(msg, options));
  const enriched = [];

  // PATCH FASE3 400MSG: cargas grandes não baixam mídia/avatar na etapa inicial.
  // Isso evita travar em mídia pesada. Mídia completa fica para fase própria/on-demand.
  const useLightEnrich = Boolean(options?.light) || wanted > 150;
  const concurrency = useLightEnrich ? 16 : 4;
  for (let offset = 0; offset < prefiltered.length; offset += concurrency) {
    const batch = prefiltered.slice(offset, offset + concurrency);
    const batchItems = await Promise.all(batch.map(async (msg) => {
      const item = await enrichMessageSafe(tg, dialog, msg, chatId, {
        light: useLightEnrich,
        timeoutMs: useLightEnrich ? 2500 : 7000,
        avatarTimeoutMs: 1000,
        forwardTimeoutMs: 1200,
        mediaTimeoutMs: 3000,
      });
      const accepted = applyMessageFilters([item], options);
      return accepted.length ? item : null;
    }));

    for (const item of batchItems) {
      if (item) {
        enriched.push(item);
        if (typeof onEvent === "function") onEvent({ type: "item", item });
      }
    }

    if (typeof onEvent === "function") {
      const processed = Math.min(offset + batch.length, Math.max(total, 1));
      onEvent({
        type: "progress",
        processed,
        total: Math.max(total, 1),
        percent: Math.round((processed / Math.max(total, 1)) * 100)
      });
    }
  }

  const filtered = applyMessageFilters(enriched, options);
  const payload = {
    meta: buildMeta(filtered, options, "messages_chat", { sourceChatTitle: chatTitle, sourceChatId: String(chatId) }),
    items: filtered,
  };

  if (typeof onEvent === "function") {
    onEvent({ type: "end", total: filtered.length, requested: wanted, collected: messages.length, chatId: String(chatId), chatTitle });
  }

  return payload;
}


export async function searchMessagesInChat(chatId, query, limit = 100, options = {}, onEvent = null) {
  const tg = await startTelegram();
  const dialog = await tg.getEntity(chatId);
  const term = String(query || "").trim().toLowerCase();

  if (!term) throw new Error("Termo de busca não informado.");

  const wanted = Math.max(Number(limit || 100), 1);
  const useDateScan = Boolean(options?.dateFrom || options?.dateTo);
  const dateFromTs = parseDateInput(options?.dateFrom, false);
  let filteredBase = [];

  if (typeof onEvent === "function") {
    onEvent({
      type: "start",
      chatId: String(chatId),
      chatTitle: dialog?.title || dialog?.name || dialog?.username || String(chatId || ""),
      total: wanted,
      query
    });
  }

  if (useDateScan) {
    let scanned = 0;
    const scanCeiling = Math.max(wanted * 5, 1000);
    for await (const msg of tg.iterMessages(dialog)) {
      scanned += 1;
      const text = String(msg?.message || "").toLowerCase();
      if (rawMessagePassesDate(msg, options) && text.includes(term)) filteredBase.push(msg);
      if (typeof onEvent === "function" && (scanned === 1 || scanned % 25 === 0 || filteredBase.length >= wanted)) {
        onEvent({
          type: "progress",
          processed: filteredBase.length,
          scanned,
          total: wanted,
          percent: Math.min(95, Math.round((filteredBase.length / Math.max(wanted, 1)) * 100))
        });
      }
      if (filteredBase.length >= wanted) break;
      if (scanned >= scanCeiling) {
        if (typeof onEvent === "function") {
          onEvent({ type: "progress", processed: filteredBase.length, scanned, total: Math.max(filteredBase.length, 1), percent: 100 });
        }
        break;
      }
    }
  } else {
    const messages = await tg.getMessages(dialog, { limit: wanted });
    filteredBase = (Array.isArray(messages) ? messages : []).filter((msg) =>
      String(msg?.message || "").toLowerCase().includes(term)
    );
  }

  const total = filteredBase.length;
  const enriched = [];
  for (const msg of filteredBase) {
    const item = await enrichMessage(tg, dialog, msg, chatId);
    const accepted = applyMessageFilters([item], { ...options, text: options.text || query });
    if (accepted.length) {
      enriched.push(item);
      if (typeof onEvent === "function") onEvent({ type: "item", item });
    }
    if (typeof onEvent === "function") {
      onEvent({
        type: "progress",
        processed: enriched.length,
        total: Math.max(total, 1),
        percent: Math.round((enriched.length / Math.max(total, 1)) * 100)
      });
    }
  }

  const filtered = applyMessageFilters(enriched, { ...options, text: options.text || query });
  if (typeof onEvent === "function") {
    onEvent({
      type: "end",
      total: filtered.length,
      chatId: String(chatId),
      chatTitle: dialog?.title || dialog?.name || dialog?.username || String(chatId || ""),
      query
    });
  }

  return {
    meta: buildMeta(filtered, { ...options, query }, "search_chat"),
    items: filtered,
  };
}


async function trySearchMessagesGlobalNative(tg, query, wanted, options = {}, onEvent = null) {
  const isAborted = typeof options?.isAborted === "function" ? options.isAborted : () => false;
  if (!Api?.messages?.SearchGlobal) return null;
  const term = String(query || "").trim();
  if (!term) return null;

  const items = [];
  const seenMessages = new Set();
  const errors = [];
  let offsetRate = 0;
  let offsetPeer = new Api.InputPeerEmpty();
  let offsetId = 0;

  if (typeof onEvent === "function") {
    onEvent({ type: "start", totalDialogs: 0, query, total: wanted, phase: "native_paginated" });
  }

  try {
    for (let page = 0; page < 20 && items.length < wanted; page += 1) {
      if (isAborted()) break;
      const result = await tg.invoke(new Api.messages.SearchGlobal({
        q: term,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate,
        offsetPeer,
        offsetId,
        limit: Math.min(100, Math.max(1, wanted - items.length)),
      }));

      const chatsById = new Map();
      for (const c of Array.isArray(result?.chats) ? result.chats : []) {
        if (c?.id !== undefined && c?.id !== null) chatsById.set(String(c.id), c);
      }

      const messages = Array.isArray(result?.messages) ? result.messages : [];
      if (!messages.length) break;

      let pageAccepted = 0;
      for (const msg of messages) {
        if (isAborted() || items.length >= wanted) break;
        const channelId = msg?.peerId?.channelId?.toString?.();
        const chatId = msg?.peerId?.chatId?.toString?.();
        const userId = msg?.peerId?.userId?.toString?.();
        const rawId = channelId || chatId || userId || "";
        const msgKey = `${rawId}:${msg?.id ?? ""}`;
        if (!rawId || seenMessages.has(msgKey)) continue;
        seenMessages.add(msgKey);

        const entity = chatsById.get(String(rawId)) || null;
        const normalizedId = channelId ? `-100${channelId}` : (chatId ? `-${chatId}` : rawId);
        const dialog = {
          id: normalizedId || rawId,
          title: entity?.title || entity?.username || entity?.firstName || entity?.lastName || String(normalizedId || rawId || ""),
          name: entity?.title || entity?.username || "",
          username: entity?.username || null,
          entity: entity || msg?.peerId || null,
        };

        const enriched = await enrichMessage(tg, dialog, msg, normalizedId || rawId, { light: Boolean(options.light) });
        const accepted = applyMessageFilters([enriched], { ...options, text: options.text || query });
        if (!accepted.length) continue;

        items.push(enriched);
        pageAccepted += 1;
        if (typeof onEvent === "function") {
          onEvent({
            type: "item",
            item: enriched,
            progress: {
              processedDialogs: 0,
              totalDialogs: 0,
              found: items.length,
              total: wanted,
              percent: Math.min(99, Math.round((items.length / Math.max(wanted, 1)) * 100))
            }
          });
        }
      }

      const last = messages[messages.length - 1];
      offsetId = Number(last?.id || 0);
      offsetRate = Number(result?.nextRate ?? result?.next_rate ?? 0) || 0;
      offsetPeer = new Api.InputPeerEmpty();

      if (typeof onEvent === "function") {
        onEvent({ type: "progress", processedDialogs: page + 1, totalDialogs: 0, found: items.length, total: wanted, phase: "native_paginated", percent: Math.min(99, Math.round((items.length / Math.max(wanted, 1)) * 100)) });
      }

      if (!offsetId || pageAccepted === 0) break;
    }

    const filtered = applyMessageFilters(items.slice(0, wanted), { ...options, text: options.text || query });
    const payload = { meta: buildMeta(filtered, { ...options, query }, "search_all"), items: filtered, errors };
    if (typeof onEvent === "function") onEvent({ type: "end", total: filtered.length, errors: errors.length, items: filtered, meta: payload.meta });
    return payload;
  } catch (error) {
    console.warn("[search_all native_paginated] fallback para varredura por diálogos:", error?.message || error);
    return null;
  }
}


export async function searchMessagesAcrossChats(query, perChatLimit = 50, maxDialogs = 0, options = {}, onEvent = null) {
  const tg = await startTelegram();
  const wanted = Math.max(1, Number(options?.limit || options?.globalLimit || 100));
  const perDialog = Math.max(1, Number(perChatLimit || 50));
  const term = String(query || "").trim();
  const termLower = term.toLowerCase();
  const isAborted = typeof options?.isAborted === "function" ? options.isAborted : () => false;

  if (!term) throw new Error("Termo de busca não informado.");

  if (typeof onEvent === "function") {
    onEvent({ type: "start", totalDialogs: 0, processedDialogs: 0, query, total: wanted, phase: "native_paginated" });
  }

  // PATCH V68: em modo streaming, não aguarda a busca global nativa antes de emitir resultados.
  // A chamada nativa pode ficar silenciosa por muito tempo e prender a barra em 5%/7%.
  // Para respostas progressivas, o fallback por diálogos começa imediatamente.
  if (typeof onEvent !== "function") {
    const nativePayload = await trySearchMessagesGlobalNative(tg, term, wanted, options, onEvent);
    if (!isAborted() && nativePayload && Array.isArray(nativePayload.items) && nativePayload.items.length) {
      return nativePayload;
    }
  }

  const requestedMaxDialogs = Number(maxDialogs || 0);
  const results = [];
  const errors = [];
  let processedDialogs = 0;
  const declaredTotalDialogs = requestedMaxDialogs > 0 ? requestedMaxDialogs : 0;

  if (typeof onEvent === "function") {
    onEvent({
      type: "start",
      totalDialogs: declaredTotalDialogs,
      processedDialogs: 0,
      query,
      total: wanted,
      phase: "fallback_streaming"
    });
  }

  async function* dialogIterator() {
    if (requestedMaxDialogs > 0) {
      const limited = await tg.getDialogs({ limit: requestedMaxDialogs });
      for (const dialog of limited || []) yield dialog;
      return;
    }
    for await (const dialog of tg.iterDialogs({})) {
      yield dialog;
    }
  }

  for await (const dialog of dialogIterator()) {
    if (isAborted() || results.length >= wanted) break;
    processedDialogs += 1;
    if (typeof onEvent === "function") {
      onEvent({
        type: "progress",
        processedDialogs,
        totalDialogs: declaredTotalDialogs,
        found: results.length,
        total: wanted,
        phase: "fallback_streaming_scanning",
        percent: declaredTotalDialogs ? Math.min(95, Math.round((processedDialogs / Math.max(declaredTotalDialogs, 1)) * 100)) : Math.max(1, Math.min(15, 1 + (processedDialogs % 15)))
      });
    }

    try {
      const dialogId = dialog.id?.toString?.() ?? "";
      const entity = dialog.entity || dialog.id;
      const candidates = [];

      try {
        for await (const msg of tg.iterMessages(entity, { search: term, limit: perDialog })) {
          if (isAborted()) break;
          candidates.push(msg);
          if (candidates.length >= perDialog) break;
        }
      } catch {
        if (!isAborted()) {
          const messages = await tg.getMessages(dialog.id, { limit: perDialog });
          for (const msg of Array.isArray(messages) ? messages : []) {
            if (isAborted()) break;
            if (String(msg?.message || "").toLowerCase().includes(termLower)) candidates.push(msg);
          }
        }
      }

      for (const msg of candidates) {
        if (isAborted() || results.length >= wanted) break;
        const text = String(msg?.message || "");
        if (!text.toLowerCase().includes(termLower)) continue;
        const enriched = await enrichMessage(tg, dialog, msg, dialogId, { light: Boolean(options.light) });
        if (isAborted()) break;
        const accepted = applyMessageFilters([enriched], { ...options, text: options.text || query });
        if (accepted.length) {
          results.push(enriched);
          if (typeof onEvent === "function") {
            onEvent({
              type: "item",
              item: enriched,
              progress: {
                processedDialogs,
                totalDialogs: declaredTotalDialogs,
                found: results.length,
                total: wanted,
                phase: "fallback_streaming",
                percent: Math.min(99, Math.round((results.length / Math.max(wanted, 1)) * 100))
              }
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        chatId: dialog.id?.toString?.() ?? "",
        chatTitle: dialog.title || "",
        error: `Falha ao ler mensagens deste chat: ${error.message}`,
      });
    }

    if (typeof onEvent === "function") {
      const pctByItems = Math.round((results.length / Math.max(wanted, 1)) * 100);
      const pctByDialogs = declaredTotalDialogs ? Math.round((processedDialogs / Math.max(declaredTotalDialogs, 1)) * 100) : 0;
      onEvent({
        type: "progress",
        processedDialogs,
        totalDialogs: declaredTotalDialogs,
        found: results.length,
        total: wanted,
        phase: "fallback_streaming",
        percent: Math.min(99, Math.max(pctByItems, declaredTotalDialogs ? Math.min(95, pctByDialogs) : 5))
      });
    }
  }

  const filtered = applyMessageFilters(results.slice(0, wanted), { ...options, text: options.text || query });
  const payload = {
    meta: buildMeta(filtered, { ...options, query }, "search_all"),
    items: filtered,
    errors,
  };

  if (typeof onEvent === "function" && !isAborted()) {
    onEvent({ type: "end", total: filtered.length, errors: errors.length, items: filtered, meta: payload.meta, processedDialogs });
  }

  return payload;
}



export async function downloadMessageMedia(chatId, messageId) {
  const tg = await startTelegram();
  const rawChatId = String(chatId || "").trim();
  const rawMessageId = String(messageId || "").trim();
  if (!rawChatId) throw new Error("Chat ID não informado para baixar mídia.");
  if (!rawMessageId || !Number.isFinite(Number(rawMessageId))) throw new Error("Message ID inválido para baixar mídia.");

  const entity = await tg.getEntity(rawChatId);
  let msg = null;
  try {
    const found = await tg.getMessages(entity, { ids: [Number(rawMessageId)] });
    if (Array.isArray(found)) msg = found[0] || null;
    else msg = found || null;
  } catch {}
  if (!msg) {
    const batch = await tg.getMessages(entity, { limit: 1, offsetId: Number(rawMessageId) + 1 });
    msg = (Array.isArray(batch) ? batch : []).find((m) => String(m?.id || "") === rawMessageId) || null;
  }
  if (!msg) throw new Error("Mensagem não localizada para baixar mídia.");
  const mediaType = detectMediaType(msg);
  if (!mediaType) throw new Error("Esta mensagem não possui mídia baixável.");
  const normalizedChatId = normalizeChatId(rawChatId, entity);
  const media = await ensureMessageMedia(tg, normalizedChatId, msg, mediaType);
  return {
    ok: true,
    chatId: normalizedChatId,
    messageId: rawMessageId,
    mediaType,
    mediaUrl: media.mediaUrl,
    previewUrl: media.previewUrl,
    thumbnail: media.thumbnail,
    media,
    link: buildPostLink(entity, msg),
  };
}


export async function downloadMessageThumbnail(chatId, messageId) {
  const tg = await startTelegram();
  const rawChatId = String(chatId || "").trim();
  const rawMessageId = String(messageId || "").trim();
  if (!rawChatId) throw new Error("Chat ID não informado para baixar miniatura.");
  if (!rawMessageId || !Number.isFinite(Number(rawMessageId))) throw new Error("Message ID inválido para baixar miniatura.");

  const entity = await tg.getEntity(rawChatId);
  let msg = null;
  try {
    const found = await tg.getMessages(entity, { ids: [Number(rawMessageId)] });
    if (Array.isArray(found)) msg = found[0] || null;
    else msg = found || null;
  } catch {}
  if (!msg) throw new Error("Mensagem não localizada para baixar miniatura.");

  const mediaType = detectMediaType(msg);
  if (!mediaType) throw new Error("Esta mensagem não possui mídia com miniatura.");
  const normalizedChatId = normalizeChatId(rawChatId, entity);
  const baseName = safeFileName(`chat_${String(normalizedChatId).replace(/[^\d-]/g, "_")}_msg_${msg.id}`) || `msg_${msg.id}`;
  const thumbFile = path.join(MEDIA_DIRS.thumbs, `${baseName}.jpg`);

  const response = {
    ok: true,
    chatId: normalizedChatId,
    messageId: rawMessageId,
    mediaType,
    mediaUrl: null,
    previewUrl: null,
    thumbnail: null,
    hasThumbnail: false,
  };

  try {
    if (!ensureThumbValid(thumbFile)) {
      await tryDownloadMediaThumb(tg, msg, thumbFile);
    }
    if (ensureThumbValid(thumbFile)) {
      response.thumbnail = publicUrlFromAbsolute(thumbFile);
      response.previewUrl = response.thumbnail;
      response.hasThumbnail = true;
      return response;
    }
  } catch {}

  if (mediaType === "photo" || mediaType === "sticker") {
    const media = await ensureMessageMedia(tg, normalizedChatId, msg, mediaType);
    response.mediaUrl = media.mediaUrl;
    response.previewUrl = media.previewUrl || media.mediaUrl;
    response.thumbnail = media.thumbnail || media.previewUrl || media.mediaUrl;
    response.hasThumbnail = Boolean(response.thumbnail);
  }

  return response;
}


export async function listMembers(chatId, limit = 500, onEvent = null) {
  const tg = await startTelegram();
  const entity = await tg.getEntity(chatId);

  const sourceChatTitle =
    entity?.title ||
    [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() ||
    entity?.username ||
    "";

  if (entity?.broadcast && !entity?.megagroup) {
    throw new Error("Este canal não expõe a lista completa de membros pela API atual.");
  }

  let participants = [];
  try {
    participants = await tg.getParticipants(entity, { limit: Number(limit) });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.includes("CHAT_ADMIN_REQUIRED")) {
      throw new Error("Este grupo/canal exige privilégio de administrador para listar membros.");
    }
    throw error;
  }

  if (typeof onEvent === "function") {
    onEvent({ type: "start", chatId: String(chatId), chatTitle: sourceChatTitle, total: participants.length });
  }

  const items = [];
  for (const participant of participants) {
    const participantId =
      participant?.id?.toString?.() ??
      participant?.userId?.toString?.() ??
      participant?.channelId?.toString?.() ??
      participant?.chatId?.toString?.() ??
      "";
    const avatarUrl = await ensureAvatarForMember(tg, participant);
    const profileLink = profileLinkForMember(participant, participantId);
    const item = {
      sourceChatId: String(chatId),
      sourceChatTitle,
      id: participantId,
      name:
        participant?.title ||
        [participant?.firstName, participant?.lastName].filter(Boolean).join(" ").trim() ||
        participant?.username ||
        "(sem nome)",
      username: participant?.username || "",
      phone: participant?.phone || "",
      avatarUrl,
      profileLink,
      isBot: Boolean(participant?.bot),
      status: participant?.status?.className || "",
    };
    items.push(item);
    if (typeof onEvent === "function") {
      onEvent({ type: "item", item });
      onEvent({ type: "progress", processed: items.length, total: participants.length, percent: Math.round((items.length / Math.max(participants.length, 1)) * 100) });
    }
  }

  if (typeof onEvent === "function") {
    onEvent({ type: "end", total: items.length, chatId: String(chatId), chatTitle: sourceChatTitle });
  }

  return {
    meta: {
      operation: "members",
      total: items.length,
      generatedAt: new Date().toISOString(),
      sourceChatId: String(chatId),
      sourceChatTitle,
    },
    items,
  };
}
