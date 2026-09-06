import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function runCompatibilityCli(targetUrl, args = process.argv.slice(2)) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(targetUrl), ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Canonical Phase 16 CLI failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}
