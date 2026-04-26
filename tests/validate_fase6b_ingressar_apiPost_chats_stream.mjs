import fs from "fs";

const checks = [];
function add(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }

const index = read("public/index.html");
const auth = read("routes/auth.js");

add("public/index.html existe", Boolean(index));
add("routes/auth.js existe", Boolean(auth));
add("index mantém Telegram App", /Telegram App/.test(index));
add("index define apiPost", /async function apiPost\s*\(/.test(index));
add("joinPublicEntity usa apiPost", /joinPublicEntity[\s\S]*apiPost\('\/auth\/public\/join'/.test(index));
add("coluna Ingressar preservada", /Ingressar \/ Solicitar acesso/.test(index));
add("auth possui POST /public/join", /router\.post\("\/public\/join"/.test(auth));
add("auth possui GET /chats/stream", /router\.get\("\/chats\/stream"/.test(auth));
add("stream emite type chat", /type:\s*"chat"/.test(auth));
add("stream emite type done", /type:\s*"done"/.test(auth));
add("não sobrescreve env/session", !/writeFileSync\([^\n]*(\.env|session\.txt)/.test(index + "\n" + auth));

const scriptOpen = (index.match(/<script\b/gi) || []).length;
const scriptClose = (index.match(/<\/script>/gi) || []).length;
add("scripts do index balanceados", scriptOpen === scriptClose, `${scriptOpen}/${scriptClose}`);

console.table(checks);
if (checks.some(c => !c.ok)) {
  console.error("VALIDAÇÃO FALHOU: FASE 6B apiPost + chats stream.");
  process.exit(1);
}
console.log("VALIDAÇÃO OK: FASE 6B corrige apiPost e /auth/chats/stream sem regressão estrutural.");
