import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAdditionalPublicComparisons } from '../verification/framework/benchmarks/additionalComparison.js';

const write = process.argv.includes('--write');
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = await runAdditionalPublicComparisons({ generatedAt: '2026-08-29' });

if (evidence.SP1.status !== 'PASS' || evidence.P3S2.status !== 'PASS' || evidence.XV1.status !== 'PASS') {
  throw new Error(`P18A comparison gate failed: ${JSON.stringify({ SP1: evidence.SP1.status, P3S2: evidence.P3S2.status, XV1: evidence.XV1.status })}`);
}

if (write) {
  const out = join(root, 'verification', 'benchmarks', 'strix21', 'milestones', 'P18A');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'p18a-additional-comparison-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  ok: true,
  write,
  evidenceHash: evidence.evidenceHash,
  SP1: evidence.SP1,
  P3S2: evidence.P3S2,
  XV1: { status: evidence.XV1.status, practice: evidence.XV1.practice, finest: evidence.XV1.finest },
  XV2: evidence.XV2,
}, null, 2));
