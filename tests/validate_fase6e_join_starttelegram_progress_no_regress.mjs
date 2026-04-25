import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const results = [];
const ok = (name, cond, detail = '') => results.push({ name, ok: Boolean(cond), detail });

const index = exists('public/index.html') ? read('public/index.html') : '';
const auth = exists('routes/auth.js') ? read('routes/auth.js') : '';

ok('public/index.html existe', exists('public/index.html'));
ok('routes/auth.js existe', exists('routes/auth.js'));
ok('index mantém Telegram App', index.includes('Telegram App'));
ok('index mantém busca global validada', index.includes('runGlobalEntities'));
ok('index mantém Ingressar / Solicitar acesso', index.includes('Ingressar / Solicitar'));
ok('index define apiPost', index.includes('async function apiPost'));
ok('index corrige progresso monotônico da busca global', index.includes('let globalProgressPct=3') && index.includes('setGlobalProgress'));
ok('index não usa seletor inexistente chatLoadFill', !index.includes('chatLoadFill'));
ok('auth importa startTelegram', /import\s*\{[\s\S]*startTelegram[\s\S]*\}\s*from\s*["']\.\.\/services\/telegram\.js["']/.test(auth));
ok('auth importa Api', auth.includes('import { Api } from "telegram"'));
ok('auth possui POST /public/join', auth.includes('router.post("/public/join"'));
ok('auth usa JoinChannel', auth.includes('Api.channels.JoinChannel'));
ok('auth usa ImportChatInvite', auth.includes('Api.messages.ImportChatInvite'));
ok('não sobrescreve .env/session', !exists('.env') && !exists('session.txt'));
const open = (index.match(/<script\b/g) || []).length;
const close = (index.match(/<\/script>/g) || []).length;
ok('scripts do index balanceados', open === close, `${open}/${close}`);

console.table(results);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error('VALIDAÇÃO FALHOU:', failed);
  process.exit(1);
}
console.log('VALIDAÇÃO OK: FASE 6E corrige startTelegram e progresso monotônico sem regressão estrutural.');
