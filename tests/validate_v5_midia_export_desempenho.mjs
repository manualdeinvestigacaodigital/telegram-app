import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
const read = (rel) => fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "";

for (const f of ["public/index.html","routes/auth.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) {
  check(`${f} existe`, fs.existsSync(path.join(ROOT, f)));
}

const html = read("public/index.html");
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`\s*;\s*}\s*function\s+buildHtmlReport/i.test(html));
const realScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
check("scripts extraídos corretamente", realScripts.length >= 1, `${realScripts.length} bloco(s)`);
check("limite de entidades permite 1000", html.includes('id="globalEntityLimit" type="number" min="1" max="1000"'));
check("mídia usa viewer mode=view", html.includes("mode='view'") || html.includes('mode="view"') || html.includes("{mode}"));
check("export HTML possui modal de detalhes", html.includes('id="detailModal"') && html.includes("data-detail-idx"));
check("export HTML possui colgroup redistribuído", html.includes('<col style="width:40px"><col style="width:78px"><col style="width:98px"'));
check("export HTML usa vídeo com controls", html.includes('class="export-video" controls'));
check("export HTML amplia coluna texto com width auto", html.includes('<col style="width:auto">'));

const auth = read("routes/auth.js");
check("auth possui mediaViewerHtml", auth.includes("function mediaViewerHtml"));
check("auth /media/open suporta mode raw", auth.includes('mode=raw') && auth.includes('router.get("/media/open"'));
check("auth /public/media/open suporta mode raw", auth.includes('mode=raw') && auth.includes('router.get("/public/media/open"'));
check("auth usa sendFile para arquivo real", auth.includes("res.sendFile(path.resolve(localPath))"));

const tgGlobal = read("services/telegram_global.js");
check("global entities ampliado para 80 páginas", tgGlobal.includes("page < 80"));
check("global entities expandedLimit ampliado", tgGlobal.includes("* 25, 1000"));

for (const f of ["routes/auth.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
  check(`${f} passa node --check`, r.status === 0, r.stderr || r.stdout);
}

// Validação sintática dos scripts embutidos no HTML.
const scripts = realScripts.map(m => m[1]);
scripts.forEach((script, idx) => {
  const tmp = path.join(ROOT, `.tmp_validate_v5_script_${idx}.js`);
  fs.writeFileSync(tmp, script, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch {}
  check(`script HTML ${idx + 1} passa node --check`, r.status === 0, r.stderr || r.stdout);
});

check("validador não exige ausência de .env local", true, "projeto real pode ter .env");
check("validador não exige ausência de session.txt local", true, "projeto real pode ter session.txt");

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação V5 aprovada.");
