// ecosystem.dev.cjs — arranque PM2 de los DOS sistemas en dev.
//   pm2 start ecosystem.dev.cjs   (y luego pm2 save)
//
// - lucebien  : SCI viejo (Express + SQLite + JSX runtime)  → http://localhost:7000
// - erp-dev   : ERP nuevo (Next.js 14 App Router)           → http://localhost:3005
//
// ⚠️ El ERP nuevo DEBE arrancar con NODE_PATH apuntando al store de pnpm. Si no,
// Next (dev) duplica el módulo `app-router-context.shared-runtime` → se crean DOS
// instancias de ActionQueueContext → la hidratación cliente revienta con
// "Invariant: Missing ActionQueueContext". El shim `.bin/next` de pnpm setea ese
// NODE_PATH automáticamente; PM2 lanzando `node <bin>` NO, por eso lo fijamos aquí.
// NODE_PATH se calcula leyendo el symlink real de next, así sobrevive a cambios de versión/hash.

const fs = require('fs');
const path = require('path');

const REPO = __dirname.replace(/\\/g, '/');
const nextReal = fs.realpathSync(path.join(REPO, 'apps/erp-web/node_modules/next')).replace(/\\/g, '/');
const variantModules = path.dirname(nextReal).replace(/\\/g, '/'); // .pnpm/<variante>/node_modules
const NODE_PATH = [
  `${nextReal}/node_modules`,
  variantModules,
  `${REPO}/node_modules/.pnpm/node_modules`,
].join(';');

module.exports = {
  apps: [
    {
      name: 'lucebien',
      cwd: REPO,
      script: 'server.js',
      interpreter: 'node',
    },
    {
      name: 'erp-dev',
      cwd: `${REPO}/apps/erp-web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'dev -p 3005',
      interpreter: 'node',
      env: { NODE_PATH },
    },
  ],
};
