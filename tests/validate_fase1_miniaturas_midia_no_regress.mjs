import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = process.cwd();
const indexPath = path.join(root, 'public', 'index.html');
const authPath = path.join(root, 'routes', 'auth.js');
const telegramPath = path.join(root, 'services', 'telegram.js');
const publicPath = path.join(root, 'services', 'telegram_public.js');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: Boolean(cond), detail });

const exists = p => fs.existsSync(p);
ok('public/index.html existe', exists(indexPath));
ok('routes/auth.js existe', exists(authPath));
ok('services/telegram.js existe', exists(telegramPath));
ok('services/telegram_public.js existe', exists(publicPath));

const index = fs.readFileSync(indexPath, 'utf8');
const auth = fs.readFileSync(authPath, 'utf8');

ok('index mantém Telegram App', index.includes('<title>Telegram App</title>'));
ok('index sem vazamento buildHtmlReport fora de script', !index.slice(index.lastIndexOf('</body></html>') + 14).includes('buildHtmlReport'));
ok('index preserva coluna Detalhes', index.includes('<th>Detalhes</th>'));
ok('index preserva modal Detalhes', index.includes('detailModal') && index.includes('openDetail'));
ok('renderMediaThumb preservado', /function\s+renderMediaThumb\s*\(/.test(index));
ok('miniaturas mantêm hidratação controlada', index.includes('IntersectionObserver') && index.includes('TG_THUMB_HYDRATOR') && index.includes('max:2'));
ok('vídeo sem thumb usa preview por video tag', index.includes('function setSlotVideo') && index.includes('<video class="thumb-video"'));
ok('hidratação não injeta mp4 em img', index.includes('looksLikeVideoUrl') && index.includes('contentType.startsWith(\'video/\')'));
ok('abertura de mídia continua em nova aba', /target="_blank"[^>]+rel="noreferrer"/.test(index));
ok('export HTML usa thumbnail/video preview', index.includes('<video class="export-thumb"') && index.includes("mediaHtml='<a href=\"'+esc(mediaOpen)+'\" target=\"_blank\" rel=\"noreferrer\">Abrir vídeo</a>'") === false);
ok('Detalhes no HTML exportado não quebra texto', index.includes('white-space:nowrap;word-break:normal;overflow-wrap:normal'));
ok('rota thumb interna não redireciona vídeo bruto como imagem', auth.includes('data.mediaType || data.media?.mediaType') && auth.includes('["photo", "sticker"].includes(type)'));
ok('rota thumb pública não redireciona vídeo bruto como imagem', auth.includes('data.item?.mediaType || data.media?.mediaType'));

const scriptMatches = [...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
ok('scripts reais do index balanceados', (index.match(/<script\b/gi) || []).length === (index.match(/<\/script>/gi) || []).length, `${(index.match(/<script\b/gi) || []).length}/${(index.match(/<\/script>/gi) || []).length}`);
let scriptOk = true;
let scriptError = '';
for (const [i, m] of scriptMatches.entries()) {
  try { new vm.Script(m[1], { filename: `index-script-${i + 1}.js` }); }
  catch (e) { scriptOk = false; scriptError = e.message; break; }
}
ok('scripts do index passam validação sintática', scriptOk, scriptError);

console.table(results);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error('VALIDAÇÃO FASE 1 MINIATURAS FALHOU.');
  process.exit(1);
}
console.log('VALIDAÇÃO FASE 1 MINIATURAS OK.');
