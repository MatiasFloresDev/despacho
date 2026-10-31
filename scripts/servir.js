// Levanta Despacho desde cualquier carpeta (lo usa la vista previa del editor): node scripts/servir.js [puerto]
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
require('@sap/cds/bin/serve.js').exec('all', '--port', process.argv[2] || process.env.PORT || '4004');
