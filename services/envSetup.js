import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import input from "input";

const envPath = path.resolve(".env");

function parseEnvFile() {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const raw = fs.readFileSync(envPath, "utf-8");
  const parsed = dotenv.parse(raw);
  return parsed || {};
}

function writeEnvFile(values) {
  const lines = [
    `PORT=${values.PORT || 3000}`,
    `API_ID=${values.API_ID || ""}`,
    `API_HASH=${values.API_HASH || ""}`,
  ];

  fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
}

export async function ensureEnvFile() {
  const current = parseEnvFile();

  let port = current.PORT || "3000";
  let apiId = current.API_ID || "";
  let apiHash = current.API_HASH || "";

  if (!apiId) {
    apiId = (await input.text("Digite o API_ID do Telegram: ")).trim();
  }

  if (!apiHash) {
    apiHash = (await input.text("Digite o API_HASH do Telegram: ")).trim();
  }

  if (!apiId || !apiHash) {
    throw new Error("API_ID e API_HASH são obrigatórios.");
  }

  writeEnvFile({
    PORT: port,
    API_ID: apiId,
    API_HASH: apiHash,
  });

  dotenv.config({ path: envPath, override: true });

  console.log(".env criado/atualizado automaticamente com sucesso.");
}