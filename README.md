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
```

3. Inicie o sistema:

```bash
npm start
```

Abra `http://localhost:3000`.

O servidor cria automaticamente a tabela `app_data`. Se preferir criar manualmente, use o arquivo `database.sql`.
