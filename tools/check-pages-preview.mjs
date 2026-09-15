// Fast, mandatory deployment checks. Full engineering qualification is separate.
import {spawnSync} from 'node:child_process';
const checks = [
  'tests/agent-harness.mjs',
  'tests/agent-directory.mjs',
  'tests/p25-m8-pages-assets.mjs',
  'tests/ux-workspace-geometry.mjs',
  'tests/m22-native-ribbon.mjs',
  'tests/workbench-model-lifecycle.mjs',
  'tests/webmcp-bridge-security.mjs',
  'tests/webmcp-integration.mjs',
  'tests/webmcp-browser-catalog.mjs',
  'tests/p19-m4-host-session.mjs',
  'tests/p25-m9-browser-definitions.mjs',
  'tests/p19-m3-design-workflow.mjs',
  'tests/p25-m9-attachment-ui.mjs',
  'tests/p25-expanded-capacity.mjs',
];
for (const check of checks) {
  console.log(`\nPreview check: ${check}`);
  const result = spawnSync(process.execPath, [check], {stdio:'inherit', timeout:120000});
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('PASS development preview checks; engineering qualification NOT_ESTABLISHED');
