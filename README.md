<p align="center">
  <img src="https://raw.githubusercontent.com/manualdeinvestigacaodigital/telegram-app/main/Telegram_logo.svg.png" width="120">
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

Ferramenta desenvolvida para **coleta, análise e exploração estruturada de dados da plataforma Telegram**, com foco em:

- 🕵️ investigação digital  
- 🧠 inteligência  
- 🌐 OSINT  

A aplicação permite:

- análise de chats, grupos e canais  
- busca interna e global de entidades  
- coleta de membros  
- extração de mensagens e mídias  
- exportação estruturada com integridade verificável  

---

## 🧠 ARQUITETURA DO SISTEMA

### 🔹 Backend (Node.js + Express)

Responsável por:

- autenticação com Telegram  
- integração via biblioteca **GramJS**  
- streaming de dados (NDJSON)  
- gerenciamento de cache local  

---

### 🔹 Serviços internos

- `services/telegram.js` → comunicação com Telegram  
- `services/telegram_public.js` → consultas públicas  
- `services/telegram_global.js` → busca global  

---

### 🔹 Frontend

Interface web com:

- grid estruturada de resultados  
- filtros avançados  
- visualização de mídia  
- exportação de dados  

---

## ⚙️ PREPARAÇÃO DO AMBIENTE

### 📥 Instalar Node.js

👉 https://nodejs.org

- Baixe a versão **LTS**
- Instale normalmente

---

### 📥 Instalar Python

👉 https://www.python.org/downloads/

⚠️ Durante a instalação, marque:

✔ Add Python to PATH

---

### 🔍 Verificar instalação

No Prompt de Comando (CMD):

```bash
node -v
npm -v
python --version

Se retornar versões → ambiente pronto

🔐 OBTENÇÃO DA API DO TELEGRAM

👉 https://my.telegram.org

Passo a passo:
Faça login com seu número
Acesse API development tools
Crie uma aplicação
Copie:
API_ID
APP API_HASH
📥 INSTALAÇÃO DO PROJETO
git clone https://github.com/manualdeinvestigacaodigital/telegram-app.git
cd telegram-app
npm install
📦 O que o npm install faz:
instala dependências do projeto
instala biblioteca GramJS
prepara ambiente backend
▶️ EXECUÇÃO
node server.js
🔑 CONFIGURAÇÃO AUTOMÁTICA

Na primeira execução:

O sistema irá solicitar:

API_ID
API_HASH

✔ O arquivo .env será criado automaticamente
✔ Não é necessário criar manualmente

🔐 LOGIN NO TELEGRAM

Durante execução no terminal:

Você informará:

📱 número de telefone
🔢 código enviado pelo Telegram
🔒 senha (caso tenha 2FA)

✔ Sessão salva automaticamente em session.txt
✔ Login persistente nas próximas execuções

🌐 ACESSO AO SISTEMA

Abra no navegador:

http://localhost:3000
🚀 FUNCIONALIDADES
📡 1. Consulta interna

Permite analisar dados da conta:

chats
grupos
canais
mensagens
membros

🌐 2. Busca global
Permite localizar entidades públicas:

canais
grupos
usuários

🔍 3. Filtros avançados
Refinamento por:

📅 data inicial/final
👤 autor
🔤 username
📞 telefone
🖼️ tipo de mídia
👁️ views
📊 4. Resultado estruturado

Exibe:

mensagens
autores
mídia
metadados

Ações disponíveis:

▶️ usar entidade
🔐 ingressar em grupo/canal
🎥 EXTRAÇÃO DE MÍDIA

Suporte completo a:

imagens
vídeos
documentos
áudios

✔ download automático
✔ cache local
✔ miniaturas

📁 EXPORTAÇÃO DE DADOS

Formatos disponíveis:

📄 HTML
📊 XLS
🧾 JSON
📑 TXT
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
Fazer login
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

mudanças na API do Telegram
restrições de acesso
conteúdo privado
📜 LICENÇA

Uso permitido para:

fins educacionais
pesquisa
investigação digital

Não autorizado para:

violação de termos
coleta indevida de dados
atividades ilícitas

📚 REFERÊNCIA TÉCNICA E AUTORIA

Este projeto integra um conjunto mais amplo de ferramentas voltadas à investigação digital, inteligência e OSINT.

O autor deste projeto é também autor da obra:

📖 Manual de Investigação Digital — Editora Juspodivm

🔗 https://www.editorajuspodivm.com.br/authors/page/view/id/206/

A obra reúne fundamentos teóricos e aplicações práticas voltadas à investigação digital contemporânea, incluindo metodologias, técnicas operacionais e utilização de ferramentas tecnológicas para coleta, preservação e análise de dados.

🧠 INTEGRAÇÃO COM A OBRA

Este repositório representa uma aplicação prática de técnicas abordadas no livro, permitindo:

✔ Aplicação direta de conceitos de OSINT
✔ Estruturação de coleta de dados digitais
✔ Organização de evidências
✔ Apoio a análises investigativas

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
API_HASH

⚠️ Essas credenciais são obrigatórias para funcionamento da ferramenta.
