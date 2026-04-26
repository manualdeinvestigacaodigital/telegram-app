import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const checks = [];
function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function read(rel) { const p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; }

const index = read("public/index.html");
const auth = read("routes/auth.js");

check("public/index.html existe", !!index);
check("routes/auth.js existe", !!auth);

const openScripts = (index.match(/<script\b/gi)||[]).length;
const closeScripts = (index.match(/<\/script>/gi)||[]).length;
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais balanceados", openScripts === closeScripts, `${openScripts}/${closeScripts}`);

check("preserva V6 maxDialogs 2500", index.includes("const maxDialogs=2500") && auth.includes("maxDialogs || 2500"));
check("preserva V6 mídia sem viewer intermediário", auth.includes("PATCH V6 MÍDIA") && !auth.includes("Visualizador local da mídia"));
check("preserva V6 avatar falso removido", !index.includes("avatar-fallback\">'+esc(initials"));

check("V7 possui patch no index", index.includes("PATCH_V7_CACHE_MEMBROS_HASH"));
check("V7 possui rota limpar cache", auth.includes('router.post("/cache/media/clear"'));
check("V7 possui rota status cache", auth.includes('router.get("/cache/media/status"'));
check("V7 recria estrutura do cache", auth.includes("ensureCacheStructure"));
check("V7 não apaga .env", !auth.includes('unlinkSync(".env"') && !auth.includes("unlinkSync('.env'"));
check("V7 não apaga session.txt", !auth.includes("session.txt"));
check("V7 possui export integridade/hash", auth.includes('router.post("/export/integrity"') && auth.includes("sha256"));
check("V7 botão exportar integridade/hash", index.includes("Exportar integridade/hash"));
check("V7 reforça export sem avatar fallback", index.includes("noFakeAvatarFallbackInExport"));

const r = spawnSync(process.execPath, ["--check", path.join(ROOT, "routes/auth.js")], { encoding: "utf8" });
check("routes/auth.js passa node --check", r.status === 0, r.stderr || r.stdout);

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação V7 aprovada.");
