import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const indexPath = path.join(process.cwd(), "public", "index.html");
const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

check("public/index.html existe", fs.existsSync(indexPath));

if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, "utf8");

  const scriptOpen = (html.match(/<script\b/gi) || []).length;
  const scriptClose = (html.match(/<\/script>/gi) || []).length;

  check("HTML contém Telegram App", html.includes("Telegram App"));
  check("HTML contém Consulta interna da conta", html.includes("Consulta interna da conta"));
  check("HTML contém Resultado", html.includes("Resultado"));
  check("scripts balanceados", scriptOpen === scriptClose, `${scriptOpen} abertura(s) / ${scriptClose} fechamento(s)`);

  const bodyTextLeakPatterns = [
    /Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i,
    /Nenhuma consulta executada ainda\.[\s\S]{0,5000}function\s+buildHtmlReport/i,
    /%7Besc\(avatar\)%7D/i,
    /%7Besc\(imgSrc\)%7D/i,
    /Unexpected end of input/i,
    /Unexpected token/i
  ];

  check("não contém vazamento visual de buildHtmlReport", !bodyTextLeakPatterns.some((re) => re.test(html)));
  check("não contém PATCH_V2 sobre HTML corrompido", !html.includes("PATCH_V2_CANCELAMENTO_OPERACAO_SEGURA"));

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const tmp = path.join(process.cwd(), ".tmp_validate_index_scripts_v2b.js");
  fs.writeFileSync(tmp, scripts.join("\n;\n"), "utf8");
  const syntax = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch {}

  check("JavaScript do index passa em node --check", syntax.status === 0, syntax.stderr || syntax.stdout || "");

  check("loadChats existe quando é chamada",
    !/loadChats\s*\(/.test(html) || /async\s+function\s+loadChats\s*\(/.test(html) || /function\s+loadChats\s*\(/.test(html)
  );
  check("possui endpoint /auth/chats", html.includes("/auth/chats"));
  check("possui controle de progresso inicial", html.includes("chatLoadBar") && html.includes("chatLoadPct"));
}

console.table(checks);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}

console.log("\nOK: validação V2B aprovada. HTML recuperado sem vazamento visual.");
