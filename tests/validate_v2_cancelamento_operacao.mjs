import fs from "fs";
import path from "path";

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

  check("loadChats existe quando é chamada",
    !/loadChats\s*\(/.test(html) || /async\s+function\s+loadChats\s*\(/.test(html) || /function\s+loadChats\s*\(/.test(html)
  );

  check("possui endpoint /auth/chats", html.includes("/auth/chats"));
  check("possui controle de progresso inicial", html.includes("chatLoadBar") && html.includes("chatLoadPct"));

  check("possui patch V2 de cancelamento seguro", html.includes("PATCH_V2_CANCELAMENTO_OPERACAO_SEGURA"));
  check("possui TelegramAppOperationGuard", html.includes("TelegramAppOperationGuard"));
  check("V2 não sobrescreve fetch global", !/window\.fetch\s*=|fetch\s*=\s*function/.test(html));
  check("botão Pare está vinculado", html.includes('getElementById("stopBtn")') || html.includes("getElementById('stopBtn')"));

  const bodyClose = html.toLowerCase().lastIndexOf("</body>");
  const htmlClose = html.toLowerCase().lastIndexOf("</html>");
  check("HTML possui fechamento body/html", bodyClose >= 0 && htmlClose >= bodyClose);

  const realLeakPatterns = [
    /Nenhuma consulta executada ainda\.\s*`;\}\s*function\s+buildHtmlReport/i,
    /<body[\s\S]*Unexpected end of input/i,
    /<body[\s\S]*Unexpected token/i,
    /%7Besc\(imgSrc\)%7D/i
  ];
  check("não contém vazamento real conhecido", !realLeakPatterns.some((re) => re.test(html)));
}

console.table(checks);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error("\nFALHAS:");
  for (const f of failed) console.error("-", f.name, f.detail || "");
  process.exit(1);
}

console.log("\nOK: validação V2 aprovada.");
