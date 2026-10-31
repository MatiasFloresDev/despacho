// Demo en línea (Vercel): levanta el mismo servidor CAP dentro de una función.
// La base es SQLite en memoria con los datos de ejemplo: cada instancia arranca limpia.
const path = require('node:path');
const express = require('express');
const cds = require('@sap/cds');

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
  // Con Postgres (Neon) todas las instancias comparten la base; sin él, SQLite en memoria por instancia
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url) cds.env.requires.db = { kind: 'postgres', impl: '@cap-js/postgres', credentials: { connectionString: url, ssl: { rejectUnauthorized: false } } };
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
