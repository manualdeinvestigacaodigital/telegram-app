import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import http from "http";

const ROOT = process.cwd();
const checks = [];
let startedServer = null;

function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : ""; }

function request(pathname, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port: 3000, path: pathname, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve({ ok: true, statusCode: res.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.on("error", err => resolve({ ok: false, error: err.message }));
  });
}

async function waitForHealth(ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = await request("/health", 5000);
    if (r.ok && r.statusCode === 200 && r.body.includes('"ok":true')) return r;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return await request("/health", 5000);
}

async function stopStartedServer() {
  if (!startedServer) return;
  try { startedServer.kill("SIGTERM"); } catch {}
  await new Promise(resolve => setTimeout(resolve, 1200));
  try { if (!startedServer.killed) startedServer.kill("SIGKILL"); } catch {}
}

process.on("exit", () => {
  try { if (startedServer) startedServer.kill("SIGTERM"); } catch {}
});
process.on("SIGINT", async () => { await stopStartedServer(); process.exit(130); });
process.on("SIGTERM", async () => { await stopStartedServer(); process.exit(143); });

check("package.json existe", exists("package.json"));
check("server.js existe", exists("server.js"));
check("public/index.html existe", exists("public/index.html"));
check("routes/auth.js existe", exists("routes/auth.js"));
check("services/envSetup.js existe", exists("services/envSetup.js"));
check("services/telegram.js existe", exists("services/telegram.js"));
check("services/telegram_public.js existe", exists("services/telegram_public.js"));
check("services/telegram_global.js existe", exists("services/telegram_global.js"));

// No projeto real, .env e session.txt podem existir. A validação correta é não exigir que o ZIP os substitua.
check(".env pode existir no projeto real", true, exists(".env") ? "existe no projeto real; não é erro" : "não existe; não é erro");
check("session.txt pode existir no projeto real", true, exists("session.txt") ? "existe no projeto real; não é erro" : "não existe; não é erro");

const index = read("public/index.html");
const auth = read("routes/auth.js");
const server = read("server.js");
const openScripts = (index.match(/<script\b/gi) || []).length;
const closeScripts = (index.match(/<\/script>/gi) || []).length;

check("index contém Telegram App", index.includes("Telegram App"));
check("index contém Consulta interna da conta", index.includes("Consulta interna da conta"));
check("index contém Resultado", index.includes("Resultado"));
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts reais balanceados", openScripts === closeScripts, `${openScripts}/${closeScripts}`);
check("auth usa fs/promises preservado", auth.includes('from "fs/promises"') || auth.includes("from 'fs/promises'"));
check("sem PATCH V7 quebrado", !index.includes("PATCH_V7") && !auth.includes("PATCH V7"));
check("server permite NO_OPEN_BROWSER", server.includes("NO_OPEN_BROWSER"));

for (const rel of ["server.js","routes/auth.js","services/envSetup.js","services/telegram.js","services/telegram_public.js","services/telegram_global.js"]) {
  const proc = spawn(process.execPath, ["--check", path.join(ROOT, rel)], { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  proc.stderr.on("data", d => err += d.toString());
  const code = await new Promise(resolve => proc.on("close", resolve));
  check(`${rel} passa node --check`, code === 0, err.trim());
}

if (process.env.RUN_RUNTIME === "1") {
  let health = await request("/health", 2500);
  if (health.ok && health.statusCode === 200) {
    check("runtime detectou servidor já ativo", true, "usou servidor existente; não iniciou outro");
  } else {
    startedServer = spawn("npm", ["start"], {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, NO_OPEN_BROWSER: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let logs = "";
    startedServer.stdout.on("data", d => logs += d.toString());
    startedServer.stderr.on("data", d => logs += d.toString());

    health = await waitForHealth(35000);
    check("runtime /health responde", health.ok && health.statusCode === 200, health.error || String(health.statusCode));

    const fatal = /SyntaxError|Identifier .* has already been declared|does not provide an export named|Unexpected token|Unexpected end of input|EADDRINUSE/i.test(logs);
    check("runtime sem erro fatal inicial", !fatal, logs.slice(-1200));
  }

  const home = await request("/", 15000);
  check("runtime / retorna HTML", home.ok && home.statusCode === 200 && home.body.includes("Telegram App"), home.error || String(home.statusCode));

  await stopStartedServer();
}

console.table(checks);
const failed = checks.filter(c => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}
console.log("\nOK: validação RESTORE FASE 1B aprovada.");
