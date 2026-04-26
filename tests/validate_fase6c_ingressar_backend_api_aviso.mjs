import fs from "fs";

const checks = [];
function ok(name, condition, detail = "") { checks.push({ name, ok: Boolean(condition), detail }); }
function read(path) { return fs.existsSync(path) ? fs.readFileSync(path, "utf-8") : ""; }

const index = read("public/index.html");
const auth = read("routes/auth.js");

ok("public/index.html existe", fs.existsSync("public/index.html"));
ok("routes/auth.js existe", fs.existsSync("routes/auth.js"));
ok("index mantém Telegram App", index.includes("Telegram App"));
ok("index mantém coluna Ingressar / Solicitar acesso", index.includes("Ingressar / Solicitar acesso"));
ok("index exibe aviso de sucesso pelo setStatus", index.includes("setStatus(msg,'success')"));
ok("botão distingue Ingressou/Já participa/Solicitado", index.includes("btn.textContent='Ingressou'") && index.includes("btn.textContent='Já participa'") && index.includes("btn.textContent='Solicitado'"));
ok("auth importa Api do telegram", auth.includes('import { Api } from "telegram";'));
ok("auth possui PATCH FASE 6C", auth.includes("PATCH FASE 6C"));
ok("auth possui POST /public/join", auth.includes('router.post("/public/join"'));
ok("auth usa Api.channels.JoinChannel", auth.includes("Api.channels.JoinChannel"));
ok("auth usa Api.messages.ImportChatInvite", auth.includes("Api.messages.ImportChatInvite"));
ok("auth trata USER_ALREADY_PARTICIPANT", auth.includes("USER_ALREADY_PARTICIPANT") && auth.includes("already_participant"));
ok("auth trata INVITE_REQUEST_SENT", auth.includes("INVITE_REQUEST_SENT") && auth.includes("request_sent"));
ok("auth devolve ingresso efetivado", auth.includes("Ingresso efetivado com sucesso"));
ok("não sobrescreve .env/session", !auth.includes('writeFileSync(".env') && !auth.includes("session.txt"));

const scriptOpen = (index.match(/<script\b/gi) || []).length;
const scriptClose = (index.match(/<\/script>/gi) || []).length;
ok("scripts do index balanceados", scriptOpen === scriptClose, `${scriptOpen}/${scriptClose}`);

console.table(checks);
const failed = checks.filter(x => !x.ok);
if (failed.length) {
  console.error("VALIDAÇÃO FALHOU: FASE 6C possui regressão estrutural.");
  process.exit(1);
}
console.log("VALIDAÇÃO OK: FASE 6C corrige Api no backend e aviso de ingresso/solicitação sem regressão estrutural.");
