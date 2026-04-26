import fs from "fs";
import path from "path";
import http from "http";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function request(pathname, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port: 3000, path: pathname, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ ok: true, statusCode: res.statusCode, body }));
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });

    req.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

function detectDuplicateLocalImports(src, fileName) {
  const localNames = new Map();
  const duplicates = [];

  const importPatterns = [
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["'];/g,
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["'];/g,
  ];

  for (const pattern of importPatterns) {
    for (const match of src.matchAll(pattern)) {
      const local = match[1];
      if (localNames.has(local)) {
        duplicates.push(`${fileName}: ${local}`);
      } else {
        localNames.set(local, true);
      }
    }
  }

  return duplicates;
}

function syntaxCheck(rel) {
  const full = path.join(ROOT, rel);
  const result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    detail: (result.stderr || result.stdout || "").trim(),
  };
}

// 1. Validação estrutural
check("package.json existe", exists("package.json"));
check("server.js existe", exists("server.js"));
check("public/index.html existe", exists("public/index.html"));
check("routes/auth.js existe", exists("routes/auth.js"));
check("services/envSetup.js existe", exists("services/envSetup.js"));
check("services/telegram.js existe", exists("services/telegram.js"));
check("services/telegram_public.js existe", exists("services/telegram_public.js"));
check("services/telegram_global.js existe", exists("services/telegram_global.js"));

const index = read("public/index.html");
const auth = read("routes/auth.js");

const openScripts = (index.match(/<script\b/gi) || []).length;
const closeScripts = (index.match(/<\/script>/gi) || []).length;

check("index contém Telegram App", index.includes("Telegram App"));
check("index contém Consulta interna da conta", index.includes("Consulta interna da conta"));
check("index contém Resultado", index.includes("Resultado"));
check("index sem vazamento buildHtmlReport", !/Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i.test(index));
check("scripts do index balanceados", openScripts === closeScripts, `${openScripts}/${closeScripts}`);

// 2. Identificação de import duplicado
for (const rel of [
  "server.js",
  "routes/auth.js",
  "services/envSetup.js",
  "services/telegram.js",
  "services/telegram_public.js",
  "services/telegram_global.js",
]) {
  if (!exists(rel)) continue;
  const src = read(rel);
  const duplicates = detectDuplicateLocalImports(src, rel);
  check(`${rel} sem import local duplicado`, duplicates.length === 0, duplicates.join(", "));
  const s = syntaxCheck(rel);
  check(`${rel} passa node --check`, s.ok, s.detail);
}

// 3. Identificação de porta e carregamento visual real
const health = await request("/health", 3000);
if (health.ok && health.statusCode === 200) {
  check("porta 3000 ativa com backend respondendo /health", true, "servidor já está ativo");
} else if (health.error && /ECONNREFUSED/i.test(health.error)) {
  check("porta 3000 livre ou backend não iniciado", true, "rode npm start antes do teste visual");
} else {
  check("porta 3000 sem resposta válida", false, health.error || String(health.statusCode));
}

const home = await request("/", 5000);
if (home.ok && home.statusCode === 200) {
  check("GET / retorna HTML", home.body.includes("<html") || home.body.includes("<!DOCTYPE html"), String(home.statusCode));
  check("GET / contém Telegram App", home.body.includes("Telegram App"), String(home.statusCode));
  check("GET / contém Consulta interna da conta", home.body.includes("Consulta interna da conta"));
  check("GET / contém Resultado", home.body.includes("Resultado"));
} else if (home.error && /ECONNREFUSED/i.test(home.error)) {
  check("teste visual real pendente", true, "backend não está rodando; inicie com npm start e rode novamente");
} else {
  check("GET / falhou", false, home.error || String(home.statusCode));
}

console.table(checks);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}

console.log("\nOK: validação estrutural/porta/import/carregamento visual aprovada.");
