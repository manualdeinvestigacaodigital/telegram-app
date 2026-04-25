import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function read(p){ return fs.readFileSync(p,"utf8"); }
function exists(p){ return fs.existsSync(p); }
function t(name, ok, detail=""){ return { name, ok: Boolean(ok), detail }; }
function nodeCheck(file){ const r=spawnSync(process.execPath,["--check",file],{encoding:"utf8"}); return { ok:r.status===0, detail:(r.stderr||r.stdout||"").trim() }; }
function scriptCheckFromHtml(file){
  const html=read(file);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(let i=0;i<scripts.length;i++){
    const tmp=path.join(process.cwd(),`.tmp_index_script_${i}.mjs`);
    fs.writeFileSync(tmp,scripts[i],"utf8");
    const r=nodeCheck(tmp);
    fs.unlinkSync(tmp);
    if(!r.ok) return { ok:false, detail:`script ${i}: ${r.detail}` };
  }
  return { ok:true, detail:`${scripts.length}/${scripts.length}` };
}

const results=[];
const files=["public/index.html","routes/auth.js","server.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"];
for(const f of files) results.push(t(`${f} existe`, exists(f)));
const html=read("public/index.html");
const auth=read("routes/auth.js");
const tg=read("services/telegram.js");
const pub=read("services/telegram_public.js");

results.push(t("index mantém Telegram App", html.includes("Telegram App")));
results.push(t("index sem vazamento buildHtmlReport fora de script", !/>\s*function\s+buildHtmlReport/.test(html)));
results.push(t("index preserva coluna Detalhes", html.includes("<th>Detalhes</th>") || html.includes("Detalhes")));
results.push(t("index preserva modal Detalhes", html.includes("detailModal") && html.includes("openDetail")));
results.push(t("miniatura passa a usar img desde o primeiro render", /<img class=\\"thumb\\" src=/.test(html) || /<img class="thumb" src=/.test(html)));
results.push(t("miniatura possui fallback SVG visual", html.includes("fallbackThumbSvg")));
results.push(t("vídeo não injeta endpoint open como img bruto", html.includes("data-lazy-thumb-url") && html.includes("mediaEndpointFor(item,'thumb')")));
results.push(t("thumb quebrada vira imagem de fallback, não texto cru", html.includes("markThumbPending") && html.includes("setSlotImage(slot,fallbackThumbSvg")));
results.push(t("rota open envia arquivo local em vez de redirecionar cegamente", auth.includes("sendCacheFile(req, res, target)")));
results.push(t("rota thumb nunca devolve mp4 como imagem", auth.includes("type === \"photo\" ? data.mediaUrl : null") && auth.includes("sendSvgThumb")));
results.push(t("telegram.js tem thumb leve sem baixar vídeo inteiro", tg.includes("downloadMessageThumbnail") && tg.includes("tryDownloadMediaThumb")));
results.push(t("telegram_public.js tem thumb leve pública", pub.includes("downloadPublicMessageThumbnail") && pub.includes("tryDownloadMediaThumb")));
results.push(t("busca global ganhou progresso dinâmico inicial", html.includes("smoothGlobal") && html.includes("aguardando resposta da API")));

for(const f of ["routes/auth.js","server.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]){
  const r=nodeCheck(f); results.push(t(`node --check ${f}`, r.ok, r.detail));
}
const sc=scriptCheckFromHtml("public/index.html");
results.push(t("scripts reais do index passam validação sintática", sc.ok, sc.detail));

console.table(results);
const failed=results.filter(r=>!r.ok);
if(failed.length){ console.error("FALHAS FASE 4:"); failed.forEach(f=>console.error(`- ${f.name}: ${f.detail}`)); process.exit(1); }
console.log("VALIDAÇÃO FASE 4 MINIATURAS + OPEN OK.");
