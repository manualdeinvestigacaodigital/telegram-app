import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import http from "http";

const ROOT = process.cwd();
const checks = [];
function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : ""; }

function request(pathname, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port: 3000, path: pathname, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ ok: true, statusCode: res.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

async function waitForHealth(ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = await request("/health", 5000);
    if (r.ok && r.statusCode === 200 && r.body.includes('"ok":true')) return r;
    await new Promise(r => setTimeout(r, 1000));
  }
  return await request("/health", 5000);
}

check("package.json existe", exists("package.json"));
check("server.js existe", exists("server.js"));
check("public/index.html existe", exists("public/index.html"));
check("routes/auth.js existe", exists("routes/auth.js"));
check("services/envSetup.js existe", exists("services/envSetup.js"));
check("services/telegram.js existe", exists("services/telegram.js"));
check("services/telegram_public.js existe", exists("services/telegram_public.js"));
check("services/telegram_global.js existe", exists("services/telegram_global.js"));
check("não inclui .env no pacote", !exists(".env"));
check("não inclui session.txt no pacote", !exists("session.txt"));

const index = read("public/index.html");
const auth = read("routes/auth.js");
const openScripts = (index.match(/<script\b/gi) || []).length;
const closeScripts = (index.match(/<\/script>/gi) || []).length;

check("index contém Telegram App", index.includes("Telegram App"));
check("index contém Consulta interna da conta", index.includes("Consulta interna da conta"));
check("index contém Resultado", index.includes("Resultado"));
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais balanceados", openScripts === closeScripts, `${openScripts}/${closeScripts}`);
check("auth usa fs/promises preservado", auth.includes('from "fs/promises"') || auth.includes("from 'fs/promises'"));
check("sem PATCH V7 quebrado", !index.includes("PATCH_V7") && !auth.includes("PATCH V7"));
check("HTML export sem avatar falso dinâmico", !index.includes("avatar-fallback\">${esc(initials") && !index.includes("avatar-fallback\">'+esc(initials"));

for (const rel of ["server.js","routes/auth.js","services/envSetup.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) {
  const p = path.join(ROOT, rel);
  const proc = spawn(process.execPath, ["--check", p], { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  proc.stderr.on("data", d => err += d.toString());
  const code = await new Promise(resolve => proc.on("close", resolve));
  check(`${rel} passa node --check`, code === 0, err.trim());
}

// Runtime validator is optional but included; it starts app only if RUN_RUNTIME=1.
if (process.env.RUN_RUNTIME === "1") {
  const server = spawn("npm", ["start"], { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stdout.on("data", d => logs += d.toString());
  server.stderr.on("data", d => logs += d.toString());

  const health = await waitForHealth(30000);
  check("runtime /health responde", health.ok && health.statusCode === 200, health.error || String(health.statusCode));

  const home = await request("/", 15000);
  check("runtime / retorna HTML", home.ok && home.statusCode === 200 && home.body.includes("Telegram App"), home.error || String(home.statusCode));
  check("runtime sem erro fatal inicial", !/SyntaxError|Identifier .* has already been declared|does not provide an export named|Unexpected token|Unexpected end of input/i.test(logs), logs.slice(-1200));

  server.kill("SIGTERM");
}

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação RESTORE FASE 1 aprovada.");
