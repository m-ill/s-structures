/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/harnesses/run-milestone-tests.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/harnesses/run-milestone-tests.mjs', import.meta.url));
