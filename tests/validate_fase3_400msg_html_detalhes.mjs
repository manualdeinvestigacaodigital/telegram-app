import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const checks=[];
function check(name, ok, detail=""){ checks.push({name, ok:Boolean(ok), detail}); }
function read(rel){ return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

const index=read("public/index.html");
const telegram=read("services/telegram.js");

check("public/index.html existe", fs.existsSync(path.join(ROOT,"public/index.html")));
check("services/telegram.js existe", fs.existsSync(path.join(ROOT,"services/telegram.js")));
check("index contém Telegram App", index.includes("Telegram App"));
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais do index balanceados", (index.match(/<script\b/gi)||[]).length === (index.match(/<\/script>/gi)||[]).length, `${(index.match(/<script\b/gi)||[]).length}/${(index.match(/<\/script>/gi)||[]).length}`);
check("getMessages usa PATCH FASE3 400MSG", telegram.includes("PATCH FASE3 400MSG"));
check("getMessages usa iterMessages para carga progressiva", telegram.includes("for await (const msg of tg.iterMessages(dialog, { limit: wanted }))"));
check("cargas grandes usam light enrich", telegram.includes("wanted > 150") && telegram.includes("useLightEnrich"));
check("HTML export possui coluna Detalhes", index.includes("<th>Detalhes</th>"));
check("HTML export possui botão Detalhes", index.includes('class="detail-btn"') && index.includes("data-detail-idx"));
check("HTML export possui modal Detalhes", index.includes("detailModal") && index.includes("openDetail"));
check("HTML export não usa avatar falso", !index.includes("avatar-fallback") || !index.includes("initials(it.authorName"));

for (const rel of ["services/telegram.js"]) {
  const r=spawnSync(process.execPath, ["--check", path.join(ROOT,rel)], {encoding:"utf8"});
  check(`${rel} passa node --check`, r.status===0, r.stderr||r.stdout);
}

console.table(checks);
const failed=checks.filter(c=>!c.ok);
if(failed.length){
  console.error("\\nFALHAS:");
  for(const f of failed) console.error("-", f.name, f.detail||"");
  process.exit(1);
}
console.log("\\nOK: validação FASE 3 aprovada.");
