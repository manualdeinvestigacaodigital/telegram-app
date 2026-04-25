import fs from "fs";
import vm from "vm";

const checks=[];
function ok(name, pass, detail=""){ checks.push({name, ok:!!pass, detail}); }
function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }

const index=read("public/index.html");

ok("public/index.html existe", !!index);
ok("index mantém Telegram App", /Telegram App/i.test(index));
ok("index sem vazamento buildHtmlReport", !/>\s*function\s+buildHtmlReport\s*\(/i.test(index));
ok("index preserva coluna Detalhes", /<th>Detalhes<\/th>/i.test(index));
ok("index preserva modal Detalhes", /detailModal|detail-modal/i.test(index));
ok("renderMediaThumb preservado", /function\s+renderMediaThumb\s*\(/.test(index));
ok("miniaturas usam slot controlado", /media-thumb-slot/.test(index));
ok("miniaturas não disparam download pesado direto em massa", /hydrateVisibleMediaThumbs/.test(index) && /IntersectionObserver/.test(index));
ok("fila limita hidratação de miniaturas", /TG_THUMB_HYDRATOR=\{[^}]*max:2/.test(index));
ok("fallback visual de miniatura existe", /thumb-loading/.test(index));
ok("renderMessages chama hidratação após renderizar", /setTimeout\(hydrateVisibleMediaThumbs,50\)/.test(index));
ok("abrir mídia continua em nova aba", /target="_blank"/.test(index));

const scriptMatches=[...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
ok("scripts reais do index balanceados", scriptMatches.length === (index.match(/<\/script>/gi)||[]).length, `${scriptMatches.length}/${(index.match(/<\/script>/gi)||[]).length}`);
try{
  for (const m of scriptMatches) vm.compileFunction(m[1], [], { parsingContext: vm.createContext({}) });
  ok("scripts do index passam validação sintática", true);
}catch(e){ ok("scripts do index passam validação sintática", false, e.message); }

console.table(checks);
if(checks.some(c=>!c.ok)) process.exit(1);
console.log("VALIDAÇÃO FASE 5 MINIATURAS OK.");
