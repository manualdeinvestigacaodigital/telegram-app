import http from "http";

function request(pathname, timeoutMs = 3000) {
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

const health = await request("/health");

if (health.ok && health.statusCode === 200) {
  console.log("PORTA 3000: ocupada por backend Telegram ativo.");
  console.log("Não rode outro npm start. Use a aba já aberta ou mate o processo antes.");
  process.exit(0);
}

if (health.error && /ECONNREFUSED/i.test(health.error)) {
  console.log("PORTA 3000: livre. Pode rodar npm start.");
  process.exit(0);
}

console.log("PORTA 3000: ocupada ou indisponível, mas /health não respondeu corretamente.");
console.log("Detalhe:", health.error || health.statusCode);
console.log("Se necessário, rode: taskkill /F /IM node.exe");
process.exit(1);
