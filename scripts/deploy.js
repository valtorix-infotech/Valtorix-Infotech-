#!/usr/bin/env node
/* ==========================================================================
   Deploy to Vercel with a token.

       $env:VERCEL_TOKEN = "your-token"
       node scripts/deploy.js

   The token is only used for this run and is never written to disk. Create
   one at https://vercel.com/account/tokens and revoke it afterwards.
   ========================================================================== */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const token = process.env.VERCEL_TOKEN;

if (!token) {
  console.error('VERCEL_TOKEN is not set.');
  console.error('Create one at https://vercel.com/account/tokens and run:');
  console.error('  $env:VERCEL_TOKEN = "your-token"');
  console.error('  node scripts/deploy.js');
  process.exit(1);
}

function run(args, label) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync('vercel', args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VERCEL_TOKEN: token },
    shell: true
  });
  if (res.status !== 0) {
    console.error(`\n${label} failed (exit ${res.status}).`);
    process.exit(res.status || 1);
  }
}

/* Link the local directory to the existing project. The project already has
   its domain and its environment variables, so this only tells Vercel which
   project this directory belongs to. */
if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) {
  run(['link', '--project', 'valtorixinfotech-1446', '--yes'], 'link to the project');
}

run(['--prod', '--yes'], 'deploy to production');

console.log('\nDeployed. Check it:');
console.log('  curl -s https://valtorixinfotech-1446.vercel.app/ | grep -o "<title>[^<]*</title>"');
