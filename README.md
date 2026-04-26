# 🔎 Telegram Investigation Tool

Ferramenta web para **coleta, análise e exploração estruturada de dados do Telegram**, voltada a investigação digital, inteligência e OSINT. A aplicação permite identificar e analisar chats, grupos e canais, realizar buscas internas e globais, coletar membros, aplicar filtros avançados e exportar dados com garantia de integridade e originalidade.

---

## ⚙️ PREPARAÇÃO DO AMBIENTE

Antes de executar o sistema, é necessário possuir:

- 🟢 Node.js (versão 18 ou superior recomendada)
- 🟢 NPM
- 🟢 Python (necessário para dependências internas)
- 🟢 Conta Telegram ativa
- 🟢 Credenciais da API do Telegram (API_ID e API_HASH)

---

## 🔍 VERIFICAR INSTALAÇÃO

No Prompt de Comando (CMD):

```bash
node -v
npm -v
python --version

Caso algum não esteja instalado, siga os passos abaixo.

📥 INSTALAÇÃO (SE NECESSÁRIO)
Node.js

👉 https://nodejs.org

Baixe a versão LTS e instale normalmente.

Python

👉 https://www.python.org/downloads/

⚠️ Durante a instalação, marque:

Add Python to PATH
🔐 OBTER API DO TELEGRAM

👉 https://my.telegram.org

Faça login com seu número
Acesse API development tools
Crie uma aplicação
Copie:
API_ID
API_HASH
📥 BAIXAR O PROJETO
git clone https://github.com/manualdeinvestigacaodigital/telegram-app.git
cd telegram-app
📦 INSTALAR DEPENDÊNCIAS
npm install
▶️ EXECUTAR SISTEMA
node server.js
🔑 CONFIGURAÇÃO AUTOMÁTICA

Na primeira execução, o sistema solicitará:

API_ID
API_HASH

👉 O arquivo .env será criado automaticamente
👉 Não é necessário criar manualmente

🔐 LOGIN NO TELEGRAM

O terminal solicitará:

📱 Número de telefone
🔢 Código de verificação
🔒 Senha (caso exista 2FA)

✔ Sessão salva automaticamente (session.txt)
✔ Login não será necessário nas próximas execuções

🌐 ACESSO AO SISTEMA
http://localhost:3000
🚀 FUNCIONAMENTO DA FERRAMENTA

A interface é composta por três módulos principais:

📡 1. Consulta interna da conta

Permite analisar dados já disponíveis na conta autenticada.

Funcionalidades:
🔍 Busca por:
chats
grupos
canais seguidos
🔎 Campo Termo de busca
Pesquisa dentro de um chat específico ou em toda a conta
👥 Exibição de membros
Lista completa de participantes de grupos/canais
📥 Download de membros
Exportação nos formatos:
HTML
XLS
JSON
TXT
📁 Exportação de conteúdo (mensagens)
Conteúdo de chats, grupos e canais pode ser exportado nos formatos:
HTML
XLS
JSON
TXT
🌐 2. Busca global validada

Permite localizar entidades públicas fora da conta.

Campo:

Termo para busca de entidades

Retorna:

canais
grupos
entidades públicas relacionadas ao termo
⚙️ Filtros e ordenação

Permite refinar os resultados com:

📅 Data inicial e final
👤 Autor
📞 Telefone
🔤 @username
🔁 Mensagens encaminhadas
🖼️ Tipo de mídia
👁️ Views mínimas e máximas
🔽 Ordenação por data (crescente/decrescente)
📊 3. Resultado

Exibe os dados obtidos nas consultas:

chats
grupos
canais
mensagens
membros
🔗 Ações disponíveis

Ao realizar uma Busca global validada, cada resultado permite:

▶️ Usar
Carregar a entidade como base de análise
🔐 Ingressar / Solicitar acesso
Entrar diretamente no grupo/canal ou solicitar acesso
📁 EXPORTAÇÃO DE DADOS

A ferramenta permite baixar o conteúdo completo das consultas realizadas, incluindo:

chats
grupos
canais
mensagens
membros

Os dados podem ser exportados nos formatos:

📄 HTML
📊 XLS
🧾 JSON
📑 TXT
🔐 CADEIA DE CUSTÓDIA E INTEGRIDADE DOS DADOS

Todo arquivo exportado é automaticamente acompanhado de um arquivo adicional em formato PDF, que garante:

📌 Cadeia de custódia probatória
🔐 Integridade dos dados
🧾 Originalidade do conteúdo

O PDF gerado contém:

📁 Nome do arquivo exportado
📅 Data e hora da criação
🌐 Origem da coleta (chat, grupo ou canal)
🔐 Hash criptográfico SHA-256
🔐 Hash criptográfico SHA-512

Esses hashes são gerados no momento da criação do arquivo e permitem:

✔ comprovar que o conteúdo não foi alterado
✔ validar autenticidade
✔ garantir rastreabilidade técnica
✔ utilização em contexto pericial ou investigativo
🔄 FLUXO OPERACIONAL
1. Iniciar sistema
2. Fazer login no Telegram
3. Carregar chats
4. Realizar busca interna ou global
5. Aplicar filtros
6. Selecionar entidade
7. Analisar dados
8. Exportar conteúdo
9. Validar integridade via PDF (hash)
⚠️ SEGURANÇA

Nunca compartilhar:

.env
session.txt

Nem:

código de verificação
senha do Telegram
API_ID / API_HASH
👤 Autor

Guilherme Caselli

🎯 Finalidade
🕵️ Investigação digital
🧠 Inteligência
🌐 OSINT
📊 Análise de dados públicos
📁 Produção de evidência digital com integridade verificável
