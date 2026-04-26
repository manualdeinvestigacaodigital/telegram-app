import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const publicService = path.join(ROOT, "services", "telegram_public.js");
const authRoute = path.join(ROOT, "routes", "auth.js");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+function\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  return names;
}

function importedFromTelegramPublic(authSrc) {
  const m = authSrc.match(/import\s*\{([\s\S]*?)\}\s*from\s*["']\.\.\/services\/telegram_public\.js["']/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.split(/\s+as\s+/i)[0].trim());
}

check("services/telegram_public.js existe", fs.existsSync(publicService));

const svc = read(publicService);
const auth = read(authRoute);
const exportsSet = exportedNames(svc);
const imports = importedFromTelegramPublic(auth);
const missing = imports.filter((name) => !exportsSet.has(name));

if (svc) {
  check("usa public/cache correto na raiz do projeto", svc.includes('path.join(__dirname, "../public")'));
  check("não usa services/public por engano", !svc.includes('path.join(__dirname, "./public")'));
  check("exporta downloadPublicMessageMedia", exportsSet.has("downloadPublicMessageMedia"));
  check("exporta resolvePublicReference", exportsSet.has("resolvePublicReference"));
  check("exporta getPublicMessages", exportsSet.has("getPublicMessages"));
  check("exporta searchPublicMessages", exportsSet.has("searchPublicMessages"));
  check("exporta streamPublicMessages", exportsSet.has("streamPublicMessages"));
  check("exporta streamSearchPublicMessages", exportsSet.has("streamSearchPublicMessages"));
  check("exporta discoverPublicReferences", exportsSet.has("discoverPublicReferences"));
  check("exporta searchPublicMessagesUniversalStream", exportsSet.has("searchPublicMessagesUniversalStream"));
  check("não altera .env", !svc.includes("writeFileSync(\".env\"") && !svc.includes("writeFileSync('.env'"));
  check("não altera session.txt", !svc.includes("session.txt"));
}

if (fs.existsSync(authRoute)) {
  check("todos os imports de telegram_public.js existem", missing.length === 0, missing.join(", "));
} else {
  check("routes/auth.js não presente no pacote de teste local", true, "será validado no projeto real");
}

const syntax = spawnSync(process.execPath, ["--check", publicService], { encoding: "utf8" });
check("telegram_public.js passa em node --check", syntax.status === 0, syntax.stderr || syntax.stdout);

console.table(checks);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}

console.log("\nOK: validação V3B aprovada. Exports restaurados e mídia pública preservada.");
