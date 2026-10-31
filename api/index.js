// Demo en línea (Vercel): levanta el mismo servidor CAP dentro de una función.
// Con POSTGRES_URL (Neon) todas las instancias comparten la base; sin ella, SQLite en memoria por instancia.
const path = require('node:path');
const express = require('express');
// Conexión directa (sin pooler): CAP guarda el idioma en variables de sesión que el pooler no conserva
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
// La configuración tiene que existir ANTES de cargar CAP: de ella sale el dialecto SQL (postgres o sqlite)
if (url) process.env.CDS_CONFIG = JSON.stringify({ requires: { db: { kind: 'postgres', credentials: { connectionString: url, ssl: { rejectUnauthorized: false } } } } });
const cds = require('@sap/cds');
require('pg'); // CAP lo carga de forma dinámica: así Vercel lo incluye en la función

const raiz = path.join(__dirname, '..');
let listo;

async function iniciar() {
  process.chdir(raiz);
  cds.root = raiz;
  const app = express();
  cds.app = app;
  // Mismo modelo que en local: db + srv + anotaciones de las apps Fiori
  const csn = await cds.load('*');
  cds.model = cds.compile.for.nodejs(csn);
  await cds.connect.to('db');
  if (!url) await cds.deploy(csn).to(cds.db);   // crea las tablas y carga los CSV de db/data
  else {
    const hay = await cds.db.run(`select to_regclass('despacho_pedidos') as t`).then((r) => r[0]?.t).catch(() => null);
    if (!hay) await cds.deploy(csn).to(cds.db);  // primera vez: tablas y datos de ejemplo
  }
  app.use(express.static(path.join(raiz, 'app')));
  await cds.serve('all').in(app);
  return app;
}

module.exports = async (req, res) => {
  listo ??= iniciar();
  const app = await listo;
  return app(req, res);
};
