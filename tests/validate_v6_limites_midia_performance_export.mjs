import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const checks = [];
function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function read(rel) { const p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }

const index = read("public/index.html");
const auth = read("routes/auth.js");
const telegram = read("services/telegram.js");
const pub = read("services/telegram_public.js");
const glob = read("services/telegram_global.js");

check("public/index.html existe", !!index);
check("routes/auth.js existe", !!auth);
check("services/telegram.js existe", !!telegram);
check("services/telegram_public.js existe", !!pub);
check("services/telegram_global.js existe", !!glob);

const openScripts = (index.match(/<script\b/gi)||[]).length;
const closeScripts = (index.match(/<\/script>/gi)||[]).length;

check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais balanceados", openScripts === closeScripts, `${openScripts} abertura(s) / ${closeScripts} fechamento(s)`);
check("script do export não cria falso desbalanceamento", index.includes("<scr'+'ipt>") && index.includes("</scr'+'ipt>"));

check("busca em toda a conta usa maxDialogs 2500", index.includes("const maxDialogs=2500") && auth.includes("maxDialogs || 2500"));
check("busca em toda a conta usa perChatLimit >= limite", index.includes("const perChatLimit=Math.max(100,limit)") && auth.includes("Math.max(100, requestedLimit)"));
check("backend não encerra search_all nativo incompleto", telegram.includes("não encerra cedo quando vier menos que o limite pedido") || telegram.includes("não encerra cedo"));
check("backend combina native + fallback", telegram.includes('phase: "native+fallback"'));

check("mídia abre arquivo real sem viewer intermediário", auth.includes("PATCH V6 MÍDIA") && !auth.includes("Visualizador local da mídia"));
check("auth envia arquivo com sendFile", auth.includes("return res.sendFile(path.resolve(localPath));"));
check("auth define Accept-Ranges", auth.includes('Accept-Ranges'));

check("HTML export sem avatar falso", !index.includes("avatar-fallback\">'+esc(initials"));
check("HTML export mantém botão Detalhes", index.includes('data-detail-idx'));
check("HTML export usa modal de Detalhes", index.includes('detailModal') && index.includes('openDetail'));
check("HTML export redistribui colunas e amplia Texto", index.includes('<col style="width:34px"><col style="width:64px"><col style="width:86px"><col style="width:92px"><col style="width:86px"><col style="width:auto">'));
check("public messages busca mais que o limite antes de cortar", pub.includes("wantedLimit * 5") && pub.includes("wantedLimit + 150"));
check("global entities ampliado para 160 páginas", glob.includes("page < 160") && glob.includes("* 60"));

for (const rel of ["routes/auth.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, rel)], { encoding: "utf8" });
  check(`${rel} passa node --check`, r.status === 0, r.stderr || r.stdout);
}

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação V6 aprovada.");
