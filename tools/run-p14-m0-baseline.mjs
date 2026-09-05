/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/run-p14-m0-baseline.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/run-p14-m0-baseline.mjs', import.meta.url));
