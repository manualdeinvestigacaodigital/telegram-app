import fs from "fs";

const checks = [];
function ok(name, condition, detail = "") { checks.push({ name, ok: Boolean(condition), detail }); }
function read(path) { return fs.existsSync(path) ? fs.readFileSync(path, "utf-8") : ""; }

const index = read("public/index.html");
const auth = read("routes/auth.js");

ok("public/index.html existe", fs.existsSync("public/index.html"));
ok("routes/auth.js existe", fs.existsSync("routes/auth.js"));
ok("index mantém Telegram App", index.includes("Telegram App"));
ok("index mantém Ingressar / Solicitar acesso", index.includes("Ingressar / Solicitar acesso"));
ok("index mantém apiPost", index.includes("async function apiPost"));
ok("index mantém runGlobalEntities", index.includes("async function runGlobalEntities()"));
ok("index possui fallback da busca global", index.includes("/auth/global/entities?") && index.includes("fallback"));
ok("auth importa Api", auth.includes('import { Api } from "telegram";'));
ok("auth preserva GET /global/entities", auth.includes('router.get("/global/entities"'));
ok("auth preserva GET /global/entities/stream", auth.includes('router.get("/global/entities/stream"'));
ok("auth preserva searchGlobalEntitiesStream", auth.includes("searchGlobalEntitiesStream(query, entityTypes, limit, send)"));
ok("auth possui POST /public/join", auth.includes('router.post("/public/join"'));
ok("auth possui GET /chats/stream", auth.includes('router.get("/chats/stream"'));
ok("auth usa JoinChannel", auth.includes("Api.channels.JoinChannel"));
ok("auth usa ImportChatInvite", auth.includes("Api.messages.ImportChatInvite"));
ok("não contém .env/session no pacote", !fs.existsSync(".env") && !fs.existsSync("session.txt"));

const scriptOpen = (index.match(/<script/g) || []).length;
const scriptClose = (index.match(/<\/script>/g) || []).length;
ok("scripts do index balanceados", scriptOpen === scriptClose, `${scriptOpen}/${scriptClose}`);

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("VALIDAÇÃO FALHOU:", failed);
  process.exit(1);
}
console.log("VALIDAÇÃO OK: FASE 6D restaura busca global validada e mantém ingresso/solicitação sem regressão estrutural.");
