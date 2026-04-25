import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
const ROOT=process.cwd(); const checks=[]; const check=(name,ok,detail="")=>checks.push({name,ok:Boolean(ok),detail}); const read=rel=>fs.existsSync(path.join(ROOT,rel))?fs.readFileSync(path.join(ROOT,rel),"utf8"):"";
for(const f of ["public/index.html","routes/auth.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) check(`${f} existe`,fs.existsSync(path.join(ROOT,f)));
const html=read("public/index.html");
check("index sem vazamento buildHtmlReport",!/Nenhuma consulta executada ainda\.\s*`\s*;\s*}\s*function\s+buildHtmlReport/i.test(html));
check("scripts balanceados",(html.match(/<script\b/gi)||[]).length===(html.match(/<\/script>/gi)||[]).length);
check("index possui endpoint mídia interna on-demand",html.includes("/auth/media/open"));
check("index possui endpoint mídia pública on-demand",html.includes("/auth/public/media/open"));
check("export HTML possui coluna Detalhes",html.includes("<th>Detalhes</th>"));
check("export HTML usa vídeo executável",html.includes("<video class=\"export-video\" controls"));
check("limite de entidades permite 500",html.includes('id="globalEntityLimit" type="number" min="1" max="500"'));
const auth=read("routes/auth.js"); check("auth importa downloadMessageMedia",auth.includes("downloadMessageMedia")); check("auth importa downloadPublicMessageMedia",auth.includes("downloadPublicMessageMedia")); check("auth tem rota /media/open",auth.includes('router.get("/media/open"')); check("auth tem rota /public/media/open",auth.includes('router.get("/public/media/open"'));
check("telegram exporta downloadMessageMedia",/export\s+async\s+function\s+downloadMessageMedia\s*\(/.test(read("services/telegram.js"))); check("telegram_public exporta downloadPublicMessageMedia",/export\s+async\s+function\s+downloadPublicMessageMedia\s*\(/.test(read("services/telegram_public.js"))); check("telegram_public usa public/cache correto",read("services/telegram_public.js").includes('path.join(__dirname, "../public")')); check("global entities ampliado para 24 páginas",read("services/telegram_global.js").includes("page < 24"));
for(const f of ["routes/auth.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]){const r=spawnSync(process.execPath,["--check",path.join(ROOT,f)],{encoding:"utf8"}); check(`${f} passa node --check`,r.status===0,r.stderr||r.stdout);}
check("não inclui .env",!fs.existsSync(path.join(ROOT,".env"))); check("não inclui session.txt",!fs.existsSync(path.join(ROOT,"session.txt")));
console.table(checks); const failed=checks.filter(c=>!c.ok); if(failed.length){console.error("\nFALHAS:"); for(const f of failed) console.error("-",f.name,f.detail||""); process.exit(1);} console.log("\nOK: validação V4 aprovada.");
