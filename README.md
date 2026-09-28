# oficina_mec

Sistema de oficina mecanica com persistencia em PostgreSQL.

## Rodar com PostgreSQL

1. Instale as dependencias:

```bash
npm install
```

2. Configure a conexao do banco:

```bash
set DATABASE_URL=postgres://usuario:senha@localhost:5432/oficina_mec
```

No PowerShell:

```powershell
$env:DATABASE_URL="postgres://usuario:senha@localhost:5432/oficina_mec"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="sua-senha-segura"
$env:SESSION_SECRET="um-texto-grande-e-secreto"
```

3. Inicie o sistema:

```bash
npm start
```

Abra `http://localhost:3000`.

O servidor cria automaticamente a tabela `app_data`. Se preferir criar manualmente, use o arquivo `database.sql`.

## Login de administrador

O sistema exige login para acessar qualquer tela.

Configure estas variaveis no servidor:

- `ADMIN_USERNAME`: usuario administrador.
- `ADMIN_PASSWORD`: senha do administrador.
- `SESSION_SECRET`: segredo usado para assinar a sessao.

Em ambiente local, se `ADMIN_PASSWORD` nao estiver configurada, o sistema usa `admin` como senha apenas para facilitar testes. Em producao, configure uma senha segura.
