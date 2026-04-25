import fs from 'fs';
import path from 'path';

const root = process.cwd();
const authPath = path.join(root, 'routes', 'auth.js');
const indexPath = path.join(root, 'public', 'index.html');
const rows = [];
function check(name, ok, detail = '') { rows.push({ name, ok: Boolean(ok), detail }); }

const auth = fs.existsSync(authPath) ? fs.readFileSync(authPath, 'utf8') : '';
const index = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';

check('routes/auth.js existe', Boolean(auth));
check('public/index.html existe', Boolean(index));
check('rota /auth/chats/stream existe', /router\.get\("\/chats\/stream"/.test(auth));
check('rota /auth/public/messages/stream existe', /router\.get\("\/public\/messages\/stream"/.test(auth));
check('rota /auth/public/search/stream existe', /router\.get\("\/public\/search\/stream"/.test(auth));
check('rota pública usa streamPublicMessages', /streamPublicMessages\(reference, limit, pickFilters\(req\.query\), send\)/.test(auth));
check('rota pública usa streamSearchPublicMessages', /streamSearchPublicMessages\(reference, query, limit, pickFilters\(req\.query\), send\)/.test(auth));
check('frontend chama /auth/public/messages/stream', index.includes('/auth/public/messages/stream'));
check('frontend chama /auth/public/search/stream', index.includes('/auth/public/search/stream'));
check('frontend chama /auth/chats/stream', index.includes('/auth/chats/stream'));
check('auth.js sem placeholder', !/TODO|PLACEHOLDER|PENDENTE_AQUI/.test(auth));

console.table(rows);
const failed = rows.filter(r => !r.ok);
if (failed.length) {
  console.error('\nFalhas:', failed);
  process.exit(1);
}
console.log('\nOK - patch de rotas para Usar/consulta pública validado.');
