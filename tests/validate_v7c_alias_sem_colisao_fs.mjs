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
check("não adiciona import fs local", !auth.includes('import fs from "fs";'));
check("não adiciona import crypto local", !auth.includes('import crypto from "crypto";'));
check("usa alias fsV7C", auth.includes('import * as fsV7C from "fs";'));
check("usa alias cryptoV7C", auth.includes('import * as cryptoV7C from "crypto";'));

const openScripts = (index.match(/<script\b/gi)||[]).length;
const closeScripts = (index.match(/<\/script>/gi)||[]).length;
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais balanceados", openScripts === closeScripts, `${openScripts}/${closeScripts}`);

check("preserva V6 maxDialogs 2500", index.includes("const maxDialogs=2500") && auth.includes("maxDialogs || 2500"));
check("preserva V6 mídia sem viewer intermediário", auth.includes("PATCH V6 MÍDIA") && !auth.includes("Visualizador local da mídia"));
check("preserva V6 avatar falso removido", !index.includes("avatar-fallback\">'+esc(initials"));

check("V7C possui patch no index", index.includes("PATCH_V7C_CACHE_HASH_ALIAS_SEM_COLISAO"));
check("V7C possui rota limpar cache", auth.includes('router.post("/cache/media/clear"'));
check("V7C possui rota status cache", auth.includes('router.get("/cache/media/status"'));
check("V7C possui export integridade/hash", auth.includes('router.post("/export/integrity"') && auth.includes("sha256"));
check("V7C não apaga .env", !auth.includes('unlinkSync(".env"') && !auth.includes("unlinkSync('.env'"));
check("V7C não apaga session.txt", !auth.includes("session.txt"));
check("V7C botão exportar integridade/hash", index.includes("Exportar integridade/hash"));

const r = spawnSync(process.execPath, ["--check", path.join(ROOT, "routes/auth.js")], { encoding: "utf8" });
check("routes/auth.js passa node --check", r.status === 0, r.stderr || r.stdout);

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação V7C aprovada.");
