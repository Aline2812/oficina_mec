const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL nao configurada. A API de banco retornara erro ate configurar o PostgreSQL.");
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
    })
  : null;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(__dirname));

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get("/api/data", async (request, response) => {
  if (!pool) {
    response.status(503).json({ error: "DATABASE_URL nao configurada" });
    return;
  }

  try {
    await ensureSchema();
    const result = await pool.query("SELECT data FROM app_data WHERE id = $1", ["main"]);
    response.json({ data: result.rows[0]?.data || null });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao carregar dados" });
  }
});

app.put("/api/data", async (request, response) => {
  if (!pool) {
    response.status(503).json({ error: "DATABASE_URL nao configurada" });
    return;
  }

  try {
    await ensureSchema();
    await pool.query(
      `
        INSERT INTO app_data (id, data, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      ["main", request.body]
    );
    response.json({ ok: true });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Erro ao salvar dados" });
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Oficina Pro rodando em http://localhost:${port}`);
});
