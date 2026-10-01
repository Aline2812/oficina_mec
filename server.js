const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;
const adminUser = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || "dev-session-secret";
const isProduction = process.env.NODE_ENV === "production";

if (!databaseUrl) {
  console.warn("DATABASE_URL nao configurada. A API de banco retornara erro ate configurar o PostgreSQL.");
}

if (!adminPassword && isProduction) {
  console.warn("ADMIN_PASSWORD nao configurada. O login ficara bloqueado em producao.");
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
    })
  : null;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

function parseCookies(header = "") {
  return Object.fromEntries(header
    .split(";")
    .map((cookie) => cookie.trim().split("="))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, decodeURIComponent(value)]));
}

function sign(value) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(value)
    .digest("base64url");
}

function createSessionToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  if (signature.length !== expected.length) return false;
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.username === adminUser && Number(session.exp) > Date.now();
  } catch (error) {
    return false;
  }
}

function isAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie);
  return verifySessionToken(cookies.oficina_session);
}

function requireAuth(request, response, next) {
  if (isAuthenticated(request)) {
    setNoStore(response);
    next();
    return;
  }

  if (request.path.startsWith("/api/")) {
    response.status(401).json({ error: "Nao autorizado" });
    return;
  }

  response.redirect("/login");
}

function setNoStore(response) {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
}

function loginBlocked() {
  return isProduction && !adminPassword;
}

function validCredentials(username, password) {
  const expectedPassword = adminPassword || "admin";
  return username === adminUser && password === expectedPassword;
}

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

app.get("/login", (request, response) => {
  if (isAuthenticated(request)) {
    response.redirect("/");
    return;
  }
  setNoStore(response);
  response.sendFile(path.join(__dirname, "login.html"));
});

app.post("/api/login", (request, response) => {
  if (loginBlocked()) {
    response.status(503).send("Login bloqueado. Configure ADMIN_PASSWORD no servidor.");
    return;
  }

  const { username, password } = request.body;
  if (!validCredentials(username, password)) {
    response.redirect("/login?error=1");
    return;
  }

  const secure = request.secure || request.headers["x-forwarded-proto"] === "https";
  const cookieParts = [
    `oficina_session=${encodeURIComponent(createSessionToken(username))}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/"
  ];
  if (secure) cookieParts.push("Secure");
  response.setHeader("Set-Cookie", cookieParts.join("; "));
  response.redirect("/");
});

app.post("/api/logout", (request, response) => {
  response.setHeader("Set-Cookie", "oficina_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  response.json({ ok: true });
});

app.get("/app.js", requireAuth, (request, response) => {
  response.sendFile(path.join(__dirname, "app.js"));
});

app.get("/styles.css", requireAuth, (request, response) => {
  response.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/api/data", requireAuth, async (request, response) => {
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

app.put("/api/data", requireAuth, async (request, response) => {
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

app.get("*", requireAuth, (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Oficina Pro rodando em http://localhost:${port}`);
});
