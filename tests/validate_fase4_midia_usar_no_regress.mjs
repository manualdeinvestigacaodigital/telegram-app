import fs from "fs";
import { execFileSync } from "child_process";

const checks = [];
function ok(name, pass, detail = "") { checks.push({ name, ok: Boolean(pass), detail }); }
function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }
function checkNode(file) {
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const index = read("public/index.html");
const auth = read("routes/auth.js");
const global = read("services/telegram_global.js");

ok("public/index.html existe", !!index);
ok("routes/auth.js existe", !!auth);
ok("services/telegram_global.js existe", !!global);
ok("index mantém Telegram App", /Telegram App/i.test(index));
ok("index sem vazamento buildHtmlReport", !/>\s*function\s+buildHtmlReport\s*\(/i.test(index));
ok("index preserva coluna Detalhes", /<th>Detalhes<\/th>/i.test(index));
ok("index preserva modal Detalhes", /detailModal/i.test(index) && /renderDetailHtml/i.test(index));
ok("index possui endpoint preguiçoso de mídia", /mediaEndpointFor\(item,'open'\)/.test(index));
ok("miniatura usa rota thumb quando cache ainda não existe", /mediaEndpointFor\(item,'thumb'\)/.test(index));
ok("abrir mídia usa target _blank", /target="_blank" rel="noreferrer"/.test(index));
ok("Usar público força carga automática de 100 mensagens", /messageLimitInput'\)\)\$\('messageLimitInput'\)\.value='100'/.test(index));
ok("render público está em lote e não por item", /state\.items\.length-lastRendered>=10/.test(index));
ok("auth possui rota interna de miniatura", /\/media\/thumb/.test(auth));
ok("auth possui rota pública de miniatura", /\/public\/media\/thumb/.test(auth));
ok("busca global amplia páginas conforme quantidade", /maxGlobalPages/.test(global));
ok("routes/auth.js passa node --check", checkNode("routes/auth.js"));
ok("services/telegram_global.js passa node --check", checkNode("services/telegram_global.js"));

const scriptMatches = [...index.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
ok("scripts reais do index balanceados", (index.match(/<script\b/gi)||[]).length === (index.match(/<\/script>/gi)||[]).length, `${(index.match(/<script\b/gi)||[]).length}/${(index.match(/<\/script>/gi)||[]).length}`);
let syntaxOk = true;
for (const m of scriptMatches) {
  try { new Function(m[1]); } catch (e) { syntaxOk = false; break; }
}
ok("scripts do index passam validação sintática", syntaxOk);

console.table(checks);
if (checks.some(c => !c.ok)) process.exit(1);
console.log("VALIDAÇÃO FASE 4 MÍDIA/USAR OK.");
