# GUT Matrix (Python + React)

Aplicação multiusuário para cadastrar, avaliar (Gravidade x Urgência x Tendência), priorizar e acompanhar
problemas, com login, perfis de acesso, histórico completo de alterações, dashboard e relatórios.

* **Backend:** Python + FastAPI + Firestore (Google Firebase). Hospedagem: Vercel
* **Frontend:** React 18 + Vite + React Router

```text
gut-matrix/
├── api/                entrada da função serverless (Vercel)
├── vercel.json         configuração de deploy
├── backend/            API em Python (FastAPI)
│   ├── app/            código da API (rotas, permissões, regras do GUT)
│   ├── tests/          testes automatizados
│   ├── scripts/        demo_seed.py (dados de exemplo)
│   ├── requirements.txt
│   └── requirements-dev.txt
└── frontend/           interface em React (Vite)
    ├── src/
    └── package.json
```

---

## 1. Pré-requisitos (instalar uma vez)

| Programa | Versão | Download |
| --- | --- | --- |
| Python | 3.10 ou superior | <https://www.python.org/downloads/> |
| Node.js (inclui o npm) | 18 ou superior | <https://nodejs.org/> |

Confirme no terminal:

```bash
python3 --version     # Windows: python --version   (precisa mostrar 3.10 ou maior)
node --version        # precisa mostrar v18 ou maior
npm --version
```

Opcional, para instalar pelos gerenciadores de pacote:

```bash
# macOS (Homebrew)
brew install python node

# Ubuntu / Debian
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm

# Windows (PowerShell)
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
```

> Se o Ubuntu instalar um Node anterior ao 18, use o instalador em <https://nodejs.org/>.

---

## 2. Backend (Python): instalar e iniciar

Abra o **Terminal 1**, entre na pasta do projeto e rode:

```bash
cd backend
python3 -m venv .venv                      # Windows: python -m venv .venv
```

Ative o ambiente virtual (um dos três, conforme seu sistema):

```bash
source .venv/bin/activate                  # macOS / Linux
.venv\Scripts\Activate.ps1                 # Windows PowerShell
.venv\Scripts\activate.bat                 # Windows cmd
```

> No PowerShell, se aparecer erro de permissão, rode uma vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

Instale as dependências:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 2.1 Banco de dados (Firestore)

1. No [Firebase Console](https://console.firebase.google.com) crie um projeto e, em **Firestore Database**, crie o banco em modo nativo.
2. Em **Configurações do projeto > Contas de serviço > Gerar nova chave privada**, baixe o JSON (**não** coloque na pasta do projeto nem no git).
3. Em **Firestore > Regras**, deixe tudo fechado (só o backend acessa, via conta de serviço):
   `allow read, write: if false;`
4. Passe o conteúdo do JSON em **uma linha** na variável `FIREBASE_SERVICE_ACCOUNT` (veja abaixo) e defina `SESSION_SECRET` (qualquer texto longo e aleatório; assina o cookie de login).

```powershell
# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT = Get-Content -Raw "C:\caminho\fora-do-projeto\chave.json"
$env:SESSION_SECRET = "troque-por-um-texto-longo-e-aleatorio"
```

```bash
export FIREBASE_SERVICE_ACCOUNT="$(cat /caminho/fora-do-projeto/chave.json)"   # macOS / Linux
export SESSION_SECRET="troque-por-um-texto-longo-e-aleatorio"
```

> Sem Firebase, para só experimentar: `GUT_STORE=memory` (dados somem ao reiniciar).

### 2.2 Super Admin

Defina o e-mail e a senha do **primeiro Super Admin** (a senha precisa de 10+ caracteres, com letras e números):

```bash
export SUPERADMIN_EMAIL="voce@suaempresa.com"       # macOS / Linux
export SUPERADMIN_PASSWORD="MinhaSenha12345"
```

```powershell
$env:SUPERADMIN_EMAIL="voce@suaempresa.com"         # Windows PowerShell
$env:SUPERADMIN_PASSWORD="MinhaSenha12345"
```

```bat
set SUPERADMIN_EMAIL=voce@suaempresa.com            & rem Windows cmd
set SUPERADMIN_PASSWORD=MinhaSenha12345
```

> **Um comando por linha!** Se colocar os dois `set` na mesma linha, o cmd junta tudo no valor do e-mail e o login dá 401.

Inicie a API:

```bash
uvicorn app.main:app --reload --port 8000
```

Teste: abra <http://localhost:8000/healthz>, deve aparecer `ok`.
Deixe este terminal aberto.

> Se você não definir `SUPERADMIN_PASSWORD`, uma senha aleatória é exibida **uma única vez** neste terminal na primeira
> inicialização (e será pedido para trocá-la no primeiro login).
> A conta do Super Admin só é criada quando não há nenhum usuário no Firestore (primeira execução).

---

## 3. Frontend (React): instalar e iniciar

Abra o **Terminal 2** (outro terminal, sem fechar o primeiro):

```bash
cd frontend
npm install
npm run dev
```

Abra no navegador: **<http://localhost:5173>**

Entre com o e-mail e a senha do Super Admin definidos no passo 2.

O Vite repassa tudo que começa com `/api` para `http://localhost:8000` (veja `frontend/vite.config.js`),
então não há configuração de CORS e o login por cookie funciona direto.

---

## 4. Dados de exemplo (opcional)

Com o backend rodando, abra um **Terminal 3**:

```bash
cd backend
source .venv/bin/activate                  # (ou o comando de ativação do seu sistema, passo 2)
python scripts/demo_seed.py http://localhost:8000 voce@suaempresa.com MinhaSenha12345
```

```powershell
# Windows PowerShell
python scripts/demo_seed.py http://localhost:8000 voce@suaempresa.com MinhaSenha12345
```

O seed fala com a API por HTTP. Se `FIREBASE_SERVICE_ACCOUNT` estiver definida neste terminal, ele também espalha as datas
dos exemplos pelas últimas semanas; sem ela, essa parte é pulada. Também funciona contra o site publicado (use a URL da Vercel).

Cria usuários de teste (`carlos`, `marta`, `ana`, `diego`, `sofia` @demo.example.com, senha `DemoPassw0rd!`)
e 9 problemas com histórico. Os perfis são: carlos/marta = Manager, ana/diego = Contributor, sofia = Viewer.

---

## 5. Testes automatizados (opcional)

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

---

## 6. Rodar tudo em uma só porta (build do React servido pelo Python)

```bash
cd frontend
npm run build                    # gera frontend/dist

cd ../backend
source .venv/bin/activate
uvicorn app.main:app --port 8000
```

Abra **<http://localhost:8000>**. Se a pasta `frontend/dist` existir, o backend serve a interface e a API juntas.
Para voltar ao modo de desenvolvimento, apague `frontend/dist` ou use a porta 5173.

---

## Perfis de acesso

| | Super Admin | Manager | Contributor | Viewer |
| --- | --- | --- | --- | --- |
| Ver problemas | todos | do seu escopo (país/filial/departamento) | os seus e os atribuídos a ele | do seu escopo |
| Registrar problemas | sim | dentro do escopo | dentro do escopo | não |
| Editar conteúdo e G/U/T preliminar | tudo | no escopo | só os que registrou | não |
| Responsável, prazo, status, plano de ação | tudo | no escopo | nos atribuídos: plano e status | não |
| Validar G/U/T | **sim** | não | não | não |
| Atualizações de andamento | todos | no escopo | seus/atribuídos | não |
| Excluir problema | sim | não | não | não |
| Usuários, estrutura, auditoria | sim | não | não | não |

Novos usuários são criados pelo Super Admin em **Users > New user**; a senha temporária aparece uma vez e deve ser trocada no primeiro login.

## Regras do GUT

* Pontuação = Gravidade x Urgência x Tendência (1 a 125), calculada no servidor.
* Crítica 80-125, Muito alta 50-79, Alta 30-49, Média 15-29, Baixa 1-14 (`backend/app/gut.py`).
* O ranking usa a nota **validada** pelo Super Admin quando existe; senão, a preliminar.
* Todo campo alterado grava valor anterior, valor novo, quem e quando (aba **History** de cada problema).

## Variáveis de ambiente do backend

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `SUPERADMIN_EMAIL` | `admin@example.com` | e-mail do primeiro Super Admin |
| `SUPERADMIN_PASSWORD` | (aleatória, mostrada 1 vez) | senha do primeiro Super Admin |
| `FIREBASE_SERVICE_ACCOUNT` | (obrigatória) | JSON da conta de serviço do Firebase, em uma linha |
| `SESSION_SECRET` | (use um valor próprio) | assina o cookie de login; **obrigatória em produção** |
| `GUT_STORE` | (vazio) | `memory` usa um banco em memória (testes/experimentos) |
| `SESSION_DAYS` | `14` | duração do login |
| `STALE_DAYS` | `7` | dias sem atualização para contar como "sem atualização" |
| `COOKIE_SECURE` | `auto` | `1` força cookie só-HTTPS (use em produção) |

## Problemas comuns

* **`python3: command not found` / `python` não é reconhecido:** reinstale o Python marcando "Add to PATH" (Windows).
* **`ModuleNotFoundError: No module named 'fastapi'`:** o ambiente virtual não está ativo; rode o comando de ativação do passo 2 e `pip install -r requirements.txt`.
* **`Address already in use` (porta 8000 ou 5173):** feche o processo que usa a porta, ou use outra, por exemplo `uvicorn app.main:app --reload --port 8001` (e troque a porta no `target` em `frontend/vite.config.js`).
* **Tela de login volta sozinha / erro 401:** confirme que o backend está rodando e acesse sempre pela porta **5173** (modo dev) ou **8000** (build).
* **Esqueci a senha do Super Admin:** no Firebase Console apague a coleção `users` (e `meta/counters`) e reinicie o backend com `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`; ou, logado como outro Super Admin, use *Reset password* em Users.
* **Zerar os dados de teste:** no Firebase Console apague as coleções (ou o banco inteiro) e reinicie o backend.
* **`RuntimeError: Set FIREBASE_SERVICE_ACCOUNT`:** a variável não está definida no terminal onde o `uvicorn` roda.
* **Atualizações em tempo real:** as telas consultam o servidor a cada 15 segundos; ao alterar dados em outra aba, aguarde esse intervalo.

## Publicar na Vercel

1. Suba o projeto para um repositório (GitHub). O `.gitignore` já exclui chaves e `.env`.
2. Em <https://vercel.com/new> importe o repositório. A raiz tem `vercel.json` (build do React + função Python em `api/index.py`) e `requirements.txt`.
3. Em **Settings > Environment Variables** crie: `FIREBASE_SERVICE_ACCOUNT` (JSON em uma linha), `SESSION_SECRET`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` e, se quiser, `STALE_DAYS`/`SESSION_DAYS`.
4. Faça o deploy. No primeiro acesso a API cria países/filiais/departamentos e o Super Admin no Firestore.
5. O cookie de login já fica `Secure` em HTTPS. Opcional: rodar `demo_seed.py` apontando para a URL do site.

Cada requisição lê as coleções do Firestore; é adequado para centenas de problemas. Se crescer muito, vale mover filtros para consultas do Firestore.
