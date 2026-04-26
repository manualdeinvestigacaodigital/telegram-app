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


function normalizeSearchTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqTerms(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const term = String(item || "").replace(/\s+/g, " ").trim();
    if (!term) continue;
    const key = normalizeSearchTerm(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

// PATCH GLOBAL ENTITIES — amplia a busca pública sem travar.
// Corrige gargalo de consultas literais: acento, singular/plural e termos correlatos.
function buildGenericEntityExpansion(original = "") {
  const base = String(original || "").trim();
  const normalized = normalizeSearchTerm(base);
  const noSpace = normalized.replace(/\s+/g, "");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const main = tokens[0] || normalized;
  const terms = [base, normalized, noSpace, main];
  const add = (...items) => terms.push(...items);

  if (main.length >= 4) {
    add(
      `${main}s`, `${main}es`, `${main}br`, `${main} brasil`, `${main} brazil`,
      `${main} oficial`, `${main} canal`, `${main} canais`, `${main} grupo`, `${main} grupos`,
      `${main} notícias`, `${main} noticias`, `${main} news`, `${main} live`, `${main} tv`,
      `${main} 24h`, `${main} online`, `${main} comunidade`, `${main} forum`, `${main} fórum`
    );
  }

  if (normalized.length >= 5) {
    add(normalized.slice(0, -1), normalized.slice(0, 5), normalized.slice(0, 6), normalized.slice(0, 7));
  }

  for (const t of tokens) {
    if (t.length >= 4) {
      add(t, `${t}s`, `${t}es`, `${t} brasil`, `${t} canal`, `${t} grupo`, `${t} news`);
    }
  }

  return terms;
}

// PATCH GLOBAL ENTITIES V6 — varredura adaptativa genérica.
// Mantém os dicionários especializados já estáveis, mas acrescenta expansão para qualquer termo.
// Objetivo: respeitar melhor a quantidade escolhida pelo usuário sem depender apenas da consulta literal.
function buildGlobalEntityQueries(query = "", requestedLimit = 20) {
  const original = String(query || "").trim();
  const normalized = normalizeSearchTerm(original);
  const terms = [];
  const add = (...items) => terms.push(...items);

  add(...buildGenericEntityExpansion(original));

  if (normalized.endsWith("s") && normalized.length > 3) add(normalized.slice(0, -1));

  if (/bomb|bomba|explos|dinamit|granad|artefato|deton/.test(normalized)) {
    add(
      "bomba", "bombas", "bomba brasil", "bomba canal", "bomba grupo", "bomba news", "bomba notícias", "bomba noticias",
      "bomb", "bombs", "bomber", "bombing", "explosion", "explosive", "explosives",
      "explosão", "explosao", "explosões", "explosoes", "explosivo", "explosivos",
      "artefato explosivo", "artefatos explosivos", "detonação", "detonacao", "detonador", "detonadores",
      "dinamite", "grenade", "granada", "granadas", "pirotecnia", "fogos", "fogos de artificio", "fogos de artifício",
      "bombeiro", "bombeiros", "corpo de bombeiros", "bombeiros brasil", "resgate", "emergência", "emergencia",
      "bomba d'agua", "bomba dagua", "bomba de água", "bomba de agua", "bomba combustivel", "bomba combustível",
      "bomba hidráulica", "bomba hidraulica", "bomba automotiva", "bomba posto", "posto de gasolina",
      "bomba atomica", "bomba atômica", "bomba nuclear", "bomba relógio", "bomba relogio",
      "ofertas bomba", "promoção bomba", "promocao bomba", "aposta bomba", "bombando", "achadinho bombando"
    );
  }

  if (/polic|policiais|policial|seguranc|seguranç|delegac|deic|pm|prf|pc|civil|militar|guarda|gcm|investig|crime|criminal|osint|law|enforcement|sheriff|carabiner|guardia/.test(normalized)) {
    add(
      "polícia", "policia", "policial", "policiais", "polícias", "policias",
      "polícia civil", "policia civil", "polícia militar", "policia militar",
      "polícia federal", "policia federal", "pf", "pm", "pc", "prf",
      "polícia rodoviária", "policia rodoviaria", "polícia rodoviária federal", "policia rodoviaria federal",
      "polícia penal", "policia penal", "polícia científica", "policia cientifica",
      "polícia judiciária", "policia judiciaria", "polícia investigativa", "policia investigativa",
      "polícia ostensiva", "policia ostensiva", "força policial", "forca policial",
      "polícia local", "policia local", "polícia nacional", "policia nacional",
      "polícia municipal", "policia municipal", "polícia comunitária", "policia comunitaria",
      "policía", "policia nacional", "policia local", "policias",
      "police", "police channel", "police news", "police department", "law enforcement",
      "sheriff", "state police", "federal police", "civil police", "military police", "cop", "cops",
      "delegacia", "delegacias", "delegado", "delegados", "delegada", "delegadas",
      "investigação policial", "investigacao policial", "investigações policiais", "investigacoes policiais",
      "investigação criminal", "investigacao criminal", "investigador", "investigadores",
      "crime", "crimes", "criminal", "criminalidade", "criminologia",
      "segurança pública", "seguranca publica", "segurança", "seguranca",
      "notícias policiais", "noticias policiais", "jornalismo policial", "ocorrência policial", "ocorrencia policial",
      "plantão policial", "plantao policial", "caso policial", "casos policiais",
      "ação policial", "acao policial", "operações policiais", "operacoes policiais", "operação policial", "operacao policial",
      "prisão", "prisao", "prisões", "prisoes", "flagrante", "investigação", "investigacao",
      "perícia", "pericia", "perícia criminal", "pericia criminal", "cadeia de custódia", "cadeia de custodia",
      "inteligência policial", "inteligencia policial", "osint policial", "cybercrime", "cibercrime",
      "deic", "dhpp", "denarc", "dise", "dig", "dic", "dope", "detran",
      "rota", "bope", "coe", "gate", "baep", "força tática", "forca tatica",
      "gcm", "guarda civil", "guarda municipal", "guarda civil municipal",
      "carabinieri", "guardia civil", "gendarmerie", "interpol", "europol",
      "concursos policiais", "concurso policial", "concurso polícia", "concurso policia",
      "polícia concurso", "policia concurso", "polícia federal concurso", "policia federal concurso",
      "polícia civil concurso", "policia civil concurso", "polícia militar concurso", "policia militar concurso"
    );
  }

  if (/caminh|camin|carret|truck|frete|transport|logistic|carga|rodovi|diesel|scania|volvo|mercedes|iveco|daf|man/.test(normalized)) {
    add(
      "caminhão", "caminhao", "caminhões", "caminhoes", "caminhoneiro", "caminhoneiros",
      "caminhoneira", "caminhoneiras", "camin", "caminho", "camion", "camiones", "camionista",
      "carreta", "carretas", "carreteiro", "carreteiros", "truck", "trucks", "trucker", "truckers",
      "lorry", "lorry driver", "semi truck", "tractor truck",
      "frete", "fretes", "freteiro", "freteiros", "carga", "cargas", "cargas brasil",
      "carga pesada", "cargas pesadas", "transporte", "transportes", "transportadora", "transportadoras",
      "transporte rodoviário", "transporte rodoviario", "transporte de cargas", "logística", "logistica",
      "logística transporte", "logistica transporte", "frota", "frotas", "agregados", "agregado caminhão",
      "agregado caminhao", "agregamos caminhões", "agregamos caminhoes", "central de cargas", "fretes brasil",
      "fretes sp", "fretes brasil caminhão", "fretes brasil caminhao", "fretes e cargas",
      "rodoviário", "rodoviario", "rodovia", "estrada", "bitrem", "rodotrem", "baú caminhão", "bau caminhao",
      "baú", "bau", "sider", "graneleiro", "prancha", "munck", "guincho", "cegonha", "basculante",
      "caçamba", "cacamba", "implementos rodoviários", "implementos rodoviarios", "reboque", "semirreboque",
      "semi reboque", "carroceria", "carrocerias", "utilitários", "utilitarios", "ônibus caminhão", "onibus caminhao",
      "caminhão venda", "caminhao venda", "caminhões venda", "caminhoes venda", "caminhão usado", "caminhao usado",
      "caminhões usados", "caminhoes usados", "venda caminhão", "venda caminhao", "compra caminhão", "compra caminhao",
      "leilão caminhão", "leilao caminhao", "seguro caminhão", "seguro caminhao", "financiamento caminhão",
      "financiamento caminhao", "consórcio caminhão", "consorcio caminhao",
      "diesel", "mecânica caminhão", "mecanica caminhao", "oficina caminhão", "oficina caminhao", "peças caminhão",
      "pecas caminhao", "autopeças caminhão", "autopecas caminhao", "pneus caminhão", "pneus caminhao",
      "tacógrafo", "tacografo", "rastreador caminhão", "rastreador caminhao", "rastreamento caminhão",
      "rastreamento caminhao", "motor diesel", "caminhão quebrado", "caminhao quebrado",
      "scania", "scania caminhão", "scania caminhao", "volvo", "volvo caminhão", "volvo caminhao",
      "mercedes caminhão", "mercedes caminhao", "mercedes benz caminhão", "mercedes benz caminhao",
      "iveco", "iveco caminhão", "iveco caminhao", "daf", "daf caminhão", "daf caminhao",
      "man caminhão", "man caminhao", "vw caminhões", "vw caminhoes", "volkswagen caminhões", "volkswagen caminhoes",
      "ford cargo", "volkswagen constellation", "mb atego", "mb axor", "mb actros", "scania r", "scania p",
      "blog do caminhoneiro", "irmãos caminhoneiros", "irmaos caminhoneiros", "caminhoneiros brasil",
      "brasil caminhoneiros", "vida de caminhoneiro", "loucos por caminhão", "loucos por caminhao",
      "canal de caminhão", "canal de caminhao", "truck video", "truck simulator", "euro truck", "american truck"
    );
  }

  const wanted = Math.max(1, Number(requestedLimit || 20) || 20);
  const cap = Math.max(
    140,
    Math.min(360, wanted >= 400 ? 340 : wanted >= 300 ? 300 : wanted >= 200 ? 260 : wanted >= 100 ? 210 : 160)
  );
  return uniqTerms(terms).slice(0, cap);
}

function scoreEntityForQuery(item, primaryQuery = "") {
  const q = normalizeSearchTerm(primaryQuery);
  const title = normalizeSearchTerm(item?.title || "");
  const username = normalizeSearchTerm(item?.username || "");
  let score = 0;
  if (title === q || username === q) score += 100;
  if (title.includes(q)) score += 40;
  if (username.includes(q)) score += 35;
  if (item?.sourceKind === "contacts_search") score += 8;
  if (item?.type === "channel") score += 4;
  if (item?.type === "group") score += 3;
  return score;
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

  for (let page = 0; page < 45 && items.length < expandedLimit; page += 1) {
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
  const wanted = Math.max(Number(limit || 20), 1);
  const expandedLimit = Math.max(wanted * 80, 1800);
  const queryVariants = buildGlobalEntityQueries(q, wanted);
  const diagnostics = {
    requestedLimit: wanted,
    queryVariants,
    contactsCandidates: 0,
    globalCandidates: 0,
    returnedTotal: 0,
    shortfall: 0,
    note: "A busca global V6 usa varredura adaptativa genérica e por domínio, orientada pelo limite escolhido pelo usuário, com progresso monotônico e emissão parcial. O total final ainda depende das entidades públicas efetivamente retornadas pela API/MTProto do Telegram."
  };

  const { ownedIds, ownedUsernames, ownedTitles } = await buildOwnedSets();
  const merged = [];

  for (const term of queryVariants) {
    const remaining = Math.max(expandedLimit - merged.length, wanted);
    const contactsItems = await gatherFromContactsSearch(client, term, selected, remaining);
    diagnostics.contactsCandidates += contactsItems.length;
    merged.push(...contactsItems);
    if (merged.length >= expandedLimit) break;
  }

  for (const term of queryVariants) {
    if (merged.length >= expandedLimit) break;
    const remaining = Math.max(expandedLimit - merged.length, wanted);
    const globalItems = await gatherFromSearchGlobalCatalog(client, term, selected, remaining);
    diagnostics.globalCandidates += globalItems.length;
    merged.push(...globalItems);
  }

  let items = merged.filter((item) => {
    if (!item?.isPublicUsable) return false;
    if (!String(item?.username || "").trim()) return false;
    if (!matchEntityType(item, selected)) return false;
    if (isOwned(item, ownedIds, ownedUsernames, ownedTitles)) return false;
    return true;
  });

  items = uniqBy(items, (item) =>
    item.username
      ? `u:${String(item.username).replace(/^@/, "").toLowerCase()}`
      : `i:${String(item.id || "")}:${String(item.type || "")}`
  );

  items = items
    .map((item) => ({ ...item, relevanceScore: scoreEntityForQuery(item, q) }))
    .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0) || String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"))
    .slice(0, wanted);

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
  const wanted = Math.max(Number(limit || 20), 1);
  const expandedLimit = Math.max(wanted * 80, 1800);
  const queryVariants = buildGlobalEntityQueries(q, wanted);

  onEvent?.({ type: "start", query: q, total: wanted });

  const { ownedIds, ownedUsernames, ownedTitles } = await buildOwnedSets();
  const emitted = [];
  const seen = new Set();
  const diagnostics = {
    requestedLimit: wanted,
    queryVariants,
    contactsCandidates: 0,
    globalPagesScanned: 0,
    globalRawMessages: 0,
    globalEntityCandidates: 0,
    emittedPublicUsernameEntities: 0,
    shortfall: 0,
    note: "A busca global V6 usa varredura adaptativa genérica e por domínio, orientada pelo limite escolhido pelo usuário, com progresso monotônico e emissão parcial. O total final ainda depende das entidades públicas efetivamente retornadas pela API/MTProto do Telegram."
  };

  let maxPercent = 0;
  const emitProgress = (payload = {}) => {
    const rawPercent = Number(payload.percent || 0) || 0;
    maxPercent = Math.max(maxPercent, rawPercent);
    onEvent?.({ ...payload, percent: maxPercent });
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
    const item = { ...summary, relevanceScore: scoreEntityForQuery(summary, q) };
    emitted.push(item);
    onEvent?.({ type: "item", item });
    emitProgress({ type: "progress", processed: emitted.length, total: wanted, percent: Math.min(98, Math.max(percent, Math.round((emitted.length / wanted) * 100))) });
  };

  for (let i = 0; i < queryVariants.length && emitted.length < wanted; i += 1) {
    const term = queryVariants[i];
    const contactsItems = await gatherFromContactsSearch(client, term, selected, expandedLimit);
    diagnostics.contactsCandidates += contactsItems.length;
    for (const item of contactsItems) {
      tryEmit(item, 10 + Math.round(((i + 1) / queryVariants.length) * 25));
      if (emitted.length >= wanted) break;
    }
  }

  if (emitted.length < wanted) {
    const maxGlobalPagesPerTerm = wanted >= 400 ? 22 : wanted >= 300 ? 20 : wanted >= 200 ? 18 : wanted >= 100 ? 14 : 10;
    for (let termIndex = 0; termIndex < queryVariants.length && emitted.length < wanted; termIndex += 1) {
      const term = queryVariants[termIndex];
      let offsetRate = 0;
      let offsetPeer = new Api.InputPeerEmpty();
      let offsetId = 0;

      for (let page = 0; page < maxGlobalPagesPerTerm && emitted.length < wanted; page += 1) {
        let global = null;
        try {
          global = await client.invoke(new Api.messages.SearchGlobal({
            q: term,
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

        diagnostics.globalPagesScanned += 1;
        const rawMessages = global?.messages || [];
        diagnostics.globalRawMessages += rawMessages.length;
        const mergedEntities = [...(global?.chats || []), ...(global?.users || [])];
        diagnostics.globalEntityCandidates += mergedEntities.length;

        for (const entity of mergedEntities) {
          const summary = summarizeEntity(entity, "global_messages");
          tryEmit(summary, 40 + Math.round(((termIndex + 1) / queryVariants.length) * 50));
          if (emitted.length >= wanted) break;
        }

        if (!rawMessages.length) break;
        const last = rawMessages[rawMessages.length - 1];
        offsetId = Number(last?.id || 0);
        offsetRate = Number(global?.nextRate ?? global?.next_rate ?? 0) || 0;
        offsetPeer = new Api.InputPeerEmpty();
        emitProgress({ type: "progress", processed: emitted.length, total: wanted, percent: Math.min(95, 40 + Math.round(((termIndex + 1) / queryVariants.length) * 50)) });
      }
    }
  }

  const items = emitted
    .sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0) || String(a.title || "").localeCompare(String(b.title || ""), "pt-BR"))
    .slice(0, wanted);

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

