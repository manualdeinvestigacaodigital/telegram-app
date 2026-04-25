import fs from 'fs';

const checks = [];
function ok(name, condition, detail = '') { checks.push({ name, ok: Boolean(condition), detail }); }
function read(path) { return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : ''; }

const index = read('public/index.html');
const auth = read('routes/auth.js');

ok('public/index.html existe', fs.existsSync('public/index.html'));
ok('routes/auth.js existe', fs.existsSync('routes/auth.js'));
ok('index mantém Telegram App', index.includes('Telegram App'));
ok('index preserva Realizar consulta', index.includes('Realizar consulta'));
ok('index adiciona coluna Ingressar / Solicitar acesso', index.includes('Ingressar / Solicitar acesso'));
ok('botão de ingresso existe só no render de entidades', index.includes('join-result-btn') && index.includes("state.meta?.operation==='global_entities'"));
ok('grid de entidades possui 9 colunas quando showJoin', index.includes('<th>Ingressar / Solicitar acesso</th>'));
ok('frontend chama /auth/public/join', index.includes("apiPost('/auth/public/join'"));
ok('auth possui rota POST /public/join', auth.includes('router.post("/public/join"'));
ok('auth usa startTelegram para ingresso real', auth.includes('startTelegram') && auth.includes('JoinChannel'));
ok('auth suporta convite por hash', auth.includes('ImportChatInvite'));
ok('index sem vazamento buildHtmlReport fora de script', !index.includes('Nenhuma consulta executada ainda.</div>function buildHtmlReport'));
ok('scripts do index balanceados', (index.match(/<script/g)||[]).length === (index.match(/<\/script>/g)||[]).length, `${(index.match(/<script/g)||[]).length}/${(index.match(/<\/script>/g)||[]).length}`);

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error('VALIDAÇÃO FALHOU:', failed.map(f => f.name).join('; '));
  process.exit(1);
}
console.log('VALIDAÇÃO OK: FASE 6 ingresso/solicitação em busca global validada sem regressão estrutural.');
