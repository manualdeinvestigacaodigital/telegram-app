import fs from "fs";
import path from "path";

const indexPath = path.join(process.cwd(), "public", "index.html");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

function countRealScriptBlocks(html) {
  const open = [...html.matchAll(/<script\b[^>]*>/gi)].length;
  const close = [...html.matchAll(/<\/script>/gi)].length;
  return { open, close };
}

function hasExecutableScriptAfterBody(html) {
  const bodyClose = html.toLowerCase().lastIndexOf("</body>");
  if (bodyClose < 0) return false;
  return /<script\b/i.test(html.slice(bodyClose));
}

function hasObviousJsLeak(html) {
  const leaks = [
    "`;} function buildHtmlReport",
    "function buildHtmlReport(){",
    "Unexpected end of input",
    "Unexpected token",
    "collectFilters is not defined",
    "loadChats is not defined",
    "%7Besc(imgSrc)%7D",
  ];

  return leaks.some((s) => html.includes(s));
}

check("public/index.html existe", fs.existsSync(indexPath));

if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, "utf8");
  const scripts = countRealScriptBlocks(html);

  check("HTML contém Telegram App", html.includes("Telegram App"));
  check("HTML contém Consulta interna da conta", html.includes("Consulta interna da conta"));
  check("HTML contém Resultado", html.includes("Resultado"));
  check("HTML possui ao menos um script real", scripts.open >= 1, `${scripts.open} script(s)`);
  check("HTML não possui script depois de </body>", !hasExecutableScriptAfterBody(html));
  check("HTML não contém vazamentos/erros clássicos", !hasObviousJsLeak(html));

  const hasLoadChatsFunction = /async\s+function\s+loadChats\s*\(/.test(html) || /function\s+loadChats\s*\(/.test(html);
  const hasLoadChatsCall = /loadChats\s*\(/.test(html);

  check("loadChats existe quando é chamada", !hasLoadChatsCall || hasLoadChatsFunction);
  check("possui endpoint /auth/chats", html.includes("/auth/chats"));
  check("possui controle de progresso inicial", html.includes("chatLoadBar") && html.includes("chatLoadPct"));
}

console.table(checks);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) {
    console.error("-", f.name, f.detail || "");
  }
  process.exit(1);
}

console.log("\nOK: validação V1 aprovada.");
