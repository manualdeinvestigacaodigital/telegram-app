import { Api } from "telegram";
import { startTelegram, listChats } from "./telegram.js";

function normalizeSet(items = []) {
  return new Set(items.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean));
}

function entityTypeFrom(entity) {
  if (!entity) return "unknown";
  if (entity.className === "User") return entity.bot ? "bot" : "user";
  if (entity.className === "Chat") return "group";
  if (entity.className === "Channel") {
    return entity.broadcast ? "channel" : (entity.megagroup ? "group" : "channel");
  }
  return "unknown";
}

function summarizeEntity(entity, sourceKind = "global_messages") {
  const type = entityTypeFrom(entity);
  const username = entity?.username || null;
  const cleanUsername = username ? String(username).replace(/^@/, "") : "";
  const consultaRef = cleanUsername ? `@${cleanUsername}` : "";
  let link = "";
  if (cleanUsername) {
    link = `https://t.me/${cleanUsername}`;
  } else if (entity?.id?.toString?.()) {
    const cleanId = String(entity.id).replace(/^-100/, "");
    if (cleanId) link = `https://t.me/c/${cleanId}`;
  }

  return {
    id: entity?.id?.toString?.() || null,
    className: entity?.className || null,
    type,
    title: entity?.title || entity?.username || [entity?.firstName, entity?.lastName].filter(Boolean).join(" ").trim() || "",
    username,
    bot: Boolean(entity?.bot),
    broadcast: Boolean(entity?.broadcast),
    megagroup: Boolean(entity?.megagroup),
    flags: [entity?.broadcast ? "broadcast" : "", entity?.megagroup ? "megagroup" : "", entity?.bot ? "bot" : ""].filter(Boolean).join(", "),
    link,
    consultaRef,
    canUseInInternal: Boolean(cleanUsername),
    isPublicUsable: Boolean(cleanUsername),
    sourceKind,
  };
}

function matchEntityType(summary, selected) {
  if (!selected.size) return summary.type === "channel" || summary.type === "group";
  return (
    (selected.has("channels") && summary.type === "channel") ||
    (selected.has("groups") && summary.type === "group") ||
    (selected.has("users") && summary.type === "user") ||
    (selected.has("bots") && summary.type === "bot")
  );
}

function uniqBy(items = [], keyFn = (x) => x) {
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

function normalizeOwnedTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function buildOwnedSets() {
  const ownedIds = new Set();
  const ownedUsernames = new Set();
  const ownedTitles = new Set();

  try {
    const chats = await listChats(false);
    for (const chat of chats || []) {
      const rawId = String(chat?.id || "").trim();
      const username = String(chat?.username || "").trim().toLowerCase().replace(/^@/, "");
      const title = normalizeOwnedTitle(chat?.title || "");
      if (rawId) {
        ownedIds.add(rawId);
        ownedIds.add(rawId.replace(/^-100/, ""));
      }
      if (username) {
        ownedUsernames.add(username);
        ownedUsernames.add(`@${username}`);
      }
      if (title) {
        ownedTitles.add(title);
      }
    }
  } catch {}

  return { ownedIds, ownedUsernames, ownedTitles };
}

function isOwned(summary, ownedIds, ownedUsernames, ownedTitles) {
  const id = String(summary?.id || "").trim();
  const username = String(summary?.username || "").trim().toLowerCase().replace(/^@/, "");
  const ref = String(summary?.consultaRef || "").trim().toLowerCase().replace(/^@/, "");
  const title = normalizeOwnedTitle(summary?.title || "");

  if (id && (ownedIds.has(id) || ownedIds.has(id.replace(/^-100/, "")))) return true;
  if (username && ownedUsernames.has(username)) return true;
  if (ref && ownedUsernames.has(ref)) return true;
  if (title && ownedTitles.has(title)) return true;
  return false;
}

async function gatherFromContactsSearch(client, q, selected, expandedLimit) {
  const items = [];
  try {
    const found = await client.invoke(new Api.contacts.Search({ q, limit: expandedLimit }));
    const merged = [...(found?.chats || []), ...(found?.users || [])];
    for (const entity of merged) {
      const summary = summarizeEntity(entity, "contacts_search");
      if (!summary.isPublicUsable) continue;
      if (!matchEntityType(summary, selected)) continue;
      items.push(summary);
    }
  } catch {}
  return items;
}

async function gatherFromSearchGlobalCatalog(client, q, selected, expandedLimit) {
  const items = [];
  const seen = new Set();
  let offsetRate = 0;
  let offsetPeer = new Api.InputPeerEmpty();
  let offsetId = 0;

  for (let page = 0; page < 30 && items.length < expandedLimit; page += 1) {
    let global = null;
    try {
      global = await client.invoke(new Api.messages.SearchGlobal({
        q,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate,
        offsetPeer,
        offsetId,
        limit: 100,
      }));
    } catch {
      break;
    }

    const rawMessages = global?.messages || [];
    const mergedEntities = [...(global?.chats || []), ...(global?.users || [])];

    for (const entity of mergedEntities) {
      const summary = summarizeEntity(entity, "global_messages");
      if (!summary.isPublicUsable) continue;
      if (!matchEntityType(summary, selected)) continue;

      const key = summary.username
        ? `u:${String(summary.username).replace(/^@/, "").toLowerCase()}`
        : `i:${String(summary.id || "")}:${String(summary.type || "")}`;

      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(summary);

      if (items.length >= expandedLimit) break;
    }

    if (!rawMessages.length) break;
    const last = rawMessages[rawMessages.length - 1];
    offsetId = Number(last?.id || 0);
    offsetRate = Number(global?.nextRate ?? global?.next_rate ?? 0) || 0;
    offsetPeer = new Api.InputPeerEmpty();
  }

  return items;
}

export async function searchGlobalEntities(query = "", entityTypes = [], limit = 20) {
  const q = String(query || "").trim();
  if (!q) throw new Error("Informe o termo da busca global de entidades.");

  const client = await startTelegram();
  const selected = normalizeSet(entityTypes);
  const expandedLimit = Math.max(Number(limit || 20) * 12, 240);
  const diagnostics = {
    requestedLimit: Number(limit || 20),
    contactsCandidates: 0,
    globalCandidates: 0,
    returnedTotal: 0,
    shortfall: 0,
    note: "A busca global depende do retorno efetivo da API/MTProto do Telegram; quando a API não devolve entidades públicas suficientes com username, o total final pode ficar abaixo do limite solicitado."
  };

  const { ownedIds, ownedUsernames, ownedTitles } = await buildOwnedSets();

  const contactsItems = await gatherFromContactsSearch(client, q, selected, expandedLimit);
  const globalItems = await gatherFromSearchGlobalCatalog(client, q, selected, expandedLimit);
  diagnostics.contactsCandidates = contactsItems.length;
  diagnostics.globalCandidates = globalItems.length;

  let items = [...contactsItems, ...globalItems];

  items = items.filter((item) => {
    if (!item?.isPublicUsable) return false;
    if (!String(item?.username || "").trim()) return false;
    if (isOwned(item, ownedIds, ownedUsernames, ownedTitles)) return false;
    return true;
  });

  items = uniqBy(items, (item) =>
    item.username
      ? `u:${String(item.username).replace(/^@/, "").toLowerCase()}`
      : `i:${String(item.id || "")}:${String(item.type || "")}`
  );

  items = items.slice(0, Number(limit || 20));
  diagnostics.returnedTotal = items.length;
  diagnostics.shortfall = Math.max(0, diagnostics.requestedLimit - items.length);

  return {
    ok: true,
    operation: "global_entities",
    query: q,
    entityTypes: [...selected],
    total: items.length,
    items,
    meta: {
      operation: "global_entities",
      generatedAt: new Date().toISOString(),
      sourceChatTitle: "busca global de entidades",
      sourceChatId: "global",
      sourceKind: "global_entities",
      query: q,
      entityTypes: [...selected],
      externalOnly: true,
      diagnostics,
    },
  };
}

export async function loadGlobalReferences(query = "", entityTypes = [], limit = 20) {
  const payload = await searchGlobalEntities(query, entityTypes, limit);
  const refs = (payload.items || [])
    .filter((item) => item.link || item.consultaRef)
    .map((item) => ({ ...item, reference: item.consultaRef || item.link || "" }));

  return {
    ok: true,
    operation: "global_references",
    query: payload.query,
    entityTypes: payload.entityTypes,
    total: refs.length,
    items: refs,
    meta: {
      operation: "global_references",
      generatedAt: new Date().toISOString(),
      sourceChatTitle: "referências públicas carregadas",
      sourceChatId: "global",
      sourceKind: "global_references",
      query: payload.query,
      entityTypes: payload.entityTypes,
      publicReference: true,
    },
  };
}


export async function searchGlobalEntitiesStream(query = "", entityTypes = [], limit = 20, onEvent = null) {
  const q = String(query || "").trim();
  if (!q) throw new Error("Informe o termo da busca global de entidades.");

  const client = await startTelegram();
  const selected = normalizeSet(entityTypes);
  const expandedLimit = Math.max(Number(limit || 20) * 12, 240);
  const wanted = Math.max(Number(limit || 20), 1);

  onEvent?.({ type: "start", query: q, total: wanted });

  const { ownedIds, ownedUsernames, ownedTitles } = await buildOwnedSets();
  const emitted = [];
  const seen = new Set();
  const diagnostics = {
    requestedLimit: wanted,
    contactsCandidates: 0,
    globalPagesScanned: 0,
    globalRawMessages: 0,
    globalEntityCandidates: 0,
    emittedPublicUsernameEntities: 0,
    shortfall: 0,
    note: "A busca global depende do retorno efetivo da API/MTProto do Telegram; quando a API não devolve entidades públicas suficientes com username, o total final pode ficar abaixo do limite solicitado."
  };

  const tryEmit = (summary, percent = 0) => {
    if (!summary?.isPublicUsable) return;
    if (!String(summary?.username || "").trim()) return;
    if (!matchEntityType(summary, selected)) return;
    if (isOwned(summary, ownedIds, ownedUsernames, ownedTitles)) return;
    const key = summary.username
      ? `u:${String(summary.username).replace(/^@/, "").toLowerCase()}`
      : `i:${String(summary.id || "")}:${String(summary.type || "")}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    emitted.push(summary);
    onEvent?.({ type: "item", item: summary });
    onEvent?.({ type: "progress", processed: emitted.length, total: wanted, percent: Math.min(98, Math.max(percent, Math.round((emitted.length / wanted) * 100))) });
  };

  const contactsItems = await gatherFromContactsSearch(client, q, selected, expandedLimit);
  diagnostics.contactsCandidates = contactsItems.length;
  for (const item of contactsItems) {
    tryEmit(item, 35);
    if (emitted.length >= wanted) break;
  }

  if (emitted.length < wanted) {
    const globalItems = [];
    const localSeen = new Set();
    let offsetRate = 0;
    let offsetPeer = new Api.InputPeerEmpty();
    let offsetId = 0;

    const maxGlobalPages = Math.min(30, Math.max(8, Math.ceil(wanted / 8)));
    for (let page = 0; page < maxGlobalPages && emitted.length < wanted; page += 1) {
      let global = null;
      try {
        global = await client.invoke(new Api.messages.SearchGlobal({
          q,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetRate,
          offsetPeer,
          offsetId,
          limit: 100,
        }));
      } catch {
        break;
      }

      diagnostics.globalPagesScanned = page + 1;
      const rawMessages = global?.messages || [];
      diagnostics.globalRawMessages += rawMessages.length;
      const mergedEntities = [...(global?.chats || []), ...(global?.users || [])];
      diagnostics.globalEntityCandidates += mergedEntities.length;
      for (const entity of mergedEntities) {
        const summary = summarizeEntity(entity, "global_messages");
        const key = summary.username
          ? `u:${String(summary.username).replace(/^@/, "").toLowerCase()}`
          : `i:${String(summary.id || "")}:${String(summary.type || "")}`;
        if (!key || localSeen.has(key)) continue;
        localSeen.add(key);
        globalItems.push(summary);
        tryEmit(summary, 45 + Math.round(((page + 1) / maxGlobalPages) * 45));
        if (emitted.length >= wanted) break;
      }

      if (!rawMessages.length) break;
      const last = rawMessages[rawMessages.length - 1];
      offsetId = Number(last?.id || 0);
      offsetRate = Number(global?.nextRate ?? global?.next_rate ?? 0) || 0;
      offsetPeer = new Api.InputPeerEmpty();
      onEvent?.({ type: "progress", processed: emitted.length, total: wanted, percent: Math.min(95, 45 + Math.round(((page + 1) / maxGlobalPages) * 45)) });
    }
  }

  const items = emitted.slice(0, wanted);
  diagnostics.emittedPublicUsernameEntities = items.length;
  diagnostics.shortfall = Math.max(0, wanted - items.length);
  onEvent?.({
    type: "end",
    total: items.length,
    items,
    meta: {
      operation: "global_entities",
      generatedAt: new Date().toISOString(),
      sourceChatTitle: "busca global de entidades",
      sourceChatId: "global",
      sourceKind: "global_entities",
      query: q,
      entityTypes: [...selected],
      externalOnly: true,
      diagnostics,
    },
  });

  return {
    ok: true,
    operation: "global_entities",
    query: q,
    entityTypes: [...selected],
    total: items.length,
    items,
    meta: {
      operation: "global_entities",
      generatedAt: new Date().toISOString(),
      sourceChatTitle: "busca global de entidades",
      sourceChatId: "global",
      sourceKind: "global_entities",
      query: q,
      entityTypes: [...selected],
      externalOnly: true,
      diagnostics,
    },
  };
}
