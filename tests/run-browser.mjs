// Self-contained browser run: ephemeral local server is always stopped, including on test failure.
import { spawn } from 'node:child_process';
import { createGameServer } from '../server/server.js';
const server = await createGameServer({ port: 0, host: '127.0.0.1', quiet: true, timing: { freeze: 45, warmup: 60 } });
try {
  const child = spawn(process.execPath, ['tests/browser-smoke.mjs'], {
    stdio: 'inherit', env: { ...process.env, BASE_URL: `http://127.0.0.1:${server.port}` },
  });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} finally { await server.close(); }
