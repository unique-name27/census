// What the dev server (`npm run dev`, vite.config.ts) refuses to serve, kept here so a test can
// check it (src/dev/security/devServer.test.ts). Setting `server.fs.deny` replaces Vite's own list,
// so this is Vite 8's list plus the Ask relay's local secrets: `wrangler dev` reads them from
// ask-relay/.dev.vars, which sits inside the folder the dev server serves (docs/ASK-RELAY.md).
export const DEV_SERVER_DENY = [
  // Vite 8's own list.
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  // Wrangler's local secrets, in any folder.
  '.dev.vars',
  '.dev.vars.*',
  '**/.wrangler/**',
]
