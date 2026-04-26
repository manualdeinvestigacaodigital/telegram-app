import fs from "fs";
import vm from "vm";

function read(p) { return fs.readFileSync(p, "utf-8"); }
function ok(name, condition, detail = "") { return { name, ok: Boolean(condition), detail }; }

const results = [];
const files = [
  "public/index.html",
  "routes/auth.js",
  "services/telegram_global.js",
];
for (const f of files) results.push(ok(`${f} existe`, fs.existsSync(f)));

const html = fs.existsSync("public/index.html") ? read("public/index.html") : "";
const auth = fs.existsSync("routes/auth.js") ? read("routes/auth.js") : "";
const global = fs.existsSync("services/telegram_global.js") ? read("services/telegram_global.js") : "";

results.push(ok("index mantém Telegram App", html.includes("Telegram App")));
results.push(ok("index sem vazamento buildHtmlReport fora de script", !/<\/script>[\s\S]*buildHtmlReport\(/i.test(html)));
results.push(ok("index preserva coluna Detalhes", html.includes("<th>Detalhes</th>")));
results.push(ok("index preserva modal Detalhes", html.includes("detailModal")));
results.push(ok("renderMediaThumb preservado", html.includes("function renderMediaThumb")));
results.push(ok("hidratação agora processa todas as miniaturas", html.includes("function hydrateAllMediaThumbs") && html.includes("hydrateAllMediaThumbs();")));
results.push(ok("fila de miniaturas ampliada e controlada", html.includes("max:4") && html.includes("TG_THUMB_HYDRATOR.queue")));
results.push(ok("vídeo sem thumb usa video tag", html.includes("function setSlotVideo") && html.includes("<video class=\"thumb-video\"")));
results.push(ok("miniatura aceita fallback por mediaUrl/previewUrl", auth.includes("data.thumbnail || data.previewUrl || data.mediaUrl || null")));
results.push(ok("abertura de mídia continua em nova aba", html.includes('target="_blank"') && html.includes("Abrir mídia")));
results.push(ok("busca global registra diagnóstico de limitação", global.includes("diagnostics") && global.includes("shortfall") && global.includes("requestedLimit")));
results.push(ok("busca global aumentou páginas de varredura", global.includes("page < 30")));

const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
results.push(ok("scripts reais do index balanceados", (html.match(/<script>/g) || []).length === (html.match(/<\/script>/g) || []).length, `${(html.match(/<script>/g) || []).length}/${(html.match(/<\/script>/g) || []).length}`));
for (let i = 0; i < scriptMatches.length; i++) {
  try { new vm.Script(scriptMatches[i][1], { filename: `index-script-${i + 1}.js` }); }
  catch (e) { results.push(ok(`script ${i + 1} sintaxe`, false, e.message)); }
}
if (!results.some(r => r.name.startsWith("script "))) results.push(ok("scripts do index passam validação sintática", true));

console.table(results);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error("FALHA NA VALIDAÇÃO FASE 2:");
  for (const f of failed) console.error(`- ${f.name}: ${f.detail || ""}`);
  process.exit(1);
}
console.log("VALIDAÇÃO FASE 2 MINIATURAS + GLOBAL OK.");
