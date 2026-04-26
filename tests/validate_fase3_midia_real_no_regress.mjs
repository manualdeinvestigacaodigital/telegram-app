import fs from 'fs';
import vm from 'vm';
import { execFileSync } from 'child_process';

const files = {
  index: 'public/index.html',
  auth: 'routes/auth.js',
  server: 'server.js',
  telegram: 'services/telegram.js',
  telegramPublic: 'services/telegram_public.js',
  telegramGlobal: 'services/telegram_global.js',
};

function read(p){ return fs.readFileSync(p, 'utf8'); }
function exists(p){ return fs.existsSync(p); }
function test(name, ok, detail=''){ return { name, ok: Boolean(ok), detail }; }
function scriptBlocks(html){
  const out=[]; const re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while((m=re.exec(html))) out.push(m[1]);
  return out;
}

const results=[];
for(const [name,p] of Object.entries(files)) results.push(test(`${p} existe`, exists(p)));

const html = exists(files.index) ? read(files.index) : '';
const auth = exists(files.auth) ? read(files.auth) : '';
const server = exists(files.server) ? read(files.server) : '';
const telegram = exists(files.telegram) ? read(files.telegram) : '';
const telegramPublic = exists(files.telegramPublic) ? read(files.telegramPublic) : '';
const global = exists(files.telegramGlobal) ? read(files.telegramGlobal) : '';

results.push(test('index mantém Telegram App', html.includes('Telegram App')));
results.push(test('index sem vazamento buildHtmlReport fora de script', !html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').includes('buildHtmlReport')));
results.push(test('index preserva coluna Detalhes', html.includes('Detalhes')));
results.push(test('index preserva modal Detalhes', html.includes('detailModal')));
results.push(test('renderMediaThumb preservado', html.includes('function renderMediaThumb')));
results.push(test('hidratação usa finalUrl de vídeo, não endpoint open', html.includes('setSlotVideo(slot,finalUrl||open)')));
results.push(test('vídeo sem thumb usa video tag', html.includes('<video class="thumb-video"')));
results.push(test('abertura de mídia continua em nova aba', html.includes('target="_blank"')));

results.push(test('server possui patch Range HTTP 206', server.includes('PATCH FASE 3 MIDIA REAL') && server.includes('Content-Range') && server.includes('res.status(206)')));
const mediaRoutePos = server.indexOf('app.get(/^\\/cache\\/media');
const staticPos = server.indexOf('app.use(express.static');
results.push(test('server intercepta /cache/media antes do static', mediaRoutePos > -1 && staticPos > -1 && mediaRoutePos < staticPos));
results.push(test('server define Content-Type para mp4', server.includes('video/mp4')));
results.push(test('server rejeita arquivo vazio', server.includes('Arquivo de mídia vazio ou inválido')));

results.push(test('telegram.js valida cache de mídia', telegram.includes('cachedMediaIsValid') && telegram.includes('downloadMediaWithRetry')));
results.push(test('telegram.js remove cache inválido', telegram.includes('removeInvalidCachedMedia')));
results.push(test('telegram.js valida miniatura real', telegram.includes('ensureThumbValid')));
results.push(test('telegram_public.js valida cache de mídia pública', telegramPublic.includes('cachedMediaIsValid') && telegramPublic.includes('downloadMediaWithRetry')));
results.push(test('telegram_public.js valida miniatura pública real', telegramPublic.includes('ensureThumbValid')));
results.push(test('busca global mantém diagnóstico de limitação', global.includes('api_limit_detected') || global.includes('apiLimitDetected') || global.includes('diagnostics')));

const openScripts = (html.match(/<script\b/gi)||[]).length;
const closeScripts = (html.match(/<\/script>/gi)||[]).length;
results.push(test('scripts reais do index balanceados', openScripts === closeScripts, `${openScripts}/${closeScripts}`));
try { for (const code of scriptBlocks(html)) new vm.Script(code); results.push(test('scripts do index passam validação sintática', true)); }
catch(e){ results.push(test('scripts do index passam validação sintática', false, e.message)); }

for (const p of [files.auth, files.server, files.telegram, files.telegramPublic, files.telegramGlobal]) {
  try { execFileSync('node', ['--check', p], { stdio: 'pipe' }); results.push(test(`node --check ${p}`, true)); }
  catch (e) { results.push(test(`node --check ${p}`, false, String(e.stderr || e.message).slice(0, 300))); }
}

console.table(results);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error('FALHA NA VALIDAÇÃO FASE 3 MIDIA REAL');
  for (const f of failed) console.error(`- ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('VALIDAÇÃO FASE 3 MIDIA REAL OK.');
