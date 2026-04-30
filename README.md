<p align="center">
  <img src="https://raw.githubusercontent.com/manualdeinvestigacaodigital/telegram-app/main/Telegram_logo.svg.png" width="140">
</p>

<h1 align="center">Telegram Investigation Tool</h1>

<p align="center">
  <img src="https://img.shields.io/badge/status-estável-success">
  <img src="https://img.shields.io/badge/version-v1.0-blue">
  <img src="https://img.shields.io/badge/platform-Node.js-lightgrey">
  <img src="https://img.shields.io/badge/focus-OSINT-orange">
  <img src="https://img.shields.io/badge/license-Uso%20educacional-important">
</p>

---

## 🔎 VISÃO GERAL

Ferramenta desenvolvida para **coleta, análise e exploração estruturada de dados do Telegram**, com foco em:

- 🕵️ investigação digital  
- 🧠 inteligência  
- 🌐 OSINT  

O sistema permite:

- análise completa de chats, grupos e canais  
- busca interna e global  
- coleta de membros  
- extração de mensagens e mídias  
- exportação estruturada com integridade verificável  

---

## 🧠 ARQUITETURA DO SISTEMA

A aplicação é composta por:

### 🔹 Backend (Node.js + Express)
- gerenciamento de sessão Telegram
- integração via GramJS
- streaming de dados (NDJSON)
- cache local de mídias

### 🔹 Serviços principais
- `telegram.js` → núcleo de comunicação com Telegram :contentReference[oaicite:6]{index=6}  
- `telegram_public.js` → consultas públicas  
- `telegram_global.js` → busca global de entidades :contentReference[oaicite:7]{index=7}  

### 🔹 Frontend
- interface web analítica
- grid estruturada de dados
- filtros avançados
- exportação de resultados :contentReference[oaicite:8]{index=8}  

---

## ⚙️ REQUISITOS

- Node.js (v18+ recomendado)
- NPM
- Python (dependências internas)
- Conta Telegram ativa
- API_ID e API_HASH

---

## 🔍 VERIFICAÇÃO

```bash
node -v
npm -v
python --version
📥 INSTALAÇÃO
git clone https://github.com/manualdeinvestigacaodigital/telegram-app.git
cd telegram-app
npm install
▶️ EXECUÇÃO
node server.js
🔐 CONFIGURAÇÃO AUTOMÁTICA

Na primeira execução:

sistema solicita API_ID e API_HASH
cria automaticamente o .env

✔ Não é necessário criar manualmente

🔑 LOGIN

O sistema solicitará:

📱 telefone
🔢 código Telegram
🔒 senha (se houver 2FA)

✔ Sessão salva em session.txt
✔ Login persistente

🌐 ACESSO
http://localhost:3000
🚀 FUNCIONALIDADES
📡 1. Consulta interna
leitura de chats da conta
análise de mensagens
extração de mídia
coleta de membros
🌐 2. Busca global
identificação de entidades públicas
canais, grupos e usuários
integração com busca avançada
🔍 3. Filtros avançados
data inicial/final
autor / username
telefone
tipo de mídia
mensagens encaminhadas
views mín./máx.
📊 4. Resultado estruturado

Exibe:

mensagens
chats
autores
mídia
metadados

Com ações:

▶️ Usar entidade
🔐 Ingressar em grupo/canal
🎥 EXTRAÇÃO DE MÍDIA
imagens
vídeos
documentos
áudio

✔ download automático
✔ cache local
✔ miniaturas

📁 EXPORTAÇÃO

Formatos disponíveis:

HTML
XLS
JSON
TXT
🔐 INTEGRIDADE DOS DADOS

Geração automática de:

SHA-256
SHA-512

Permite:

validação pericial
rastreabilidade
cadeia de custódia
🔄 FLUXO OPERACIONAL
Iniciar sistema
Login Telegram
Carregar chats
Executar busca
Aplicar filtros
Analisar resultados
Exportar dados
Validar integridade
⚠️ SEGURANÇA

Nunca compartilhe:

.env
session.txt
API_ID / API_HASH
código de verificação
⚠️ LIMITAÇÕES

[Não verificado] Pode variar conforme:

mudanças na API Telegram
restrições de acesso
conteúdo privado
📜 LICENÇA

Uso permitido para:

fins educacionais
pesquisa
investigação digital

Não autorizado para:

violação de termos de uso
coleta ilegal de dados
👤 AUTOR

Guilherme Caselli
Delegado de Polícia
Especialista em investigação digital

🔗 https://instagram.com/guilhermecaselli

🎯 FINALIDADE
🕵️ Investigação digital
🧠 Inteligência
🌐 OSINT
📊 Análise de dados
📁 Produção de evidência digital
