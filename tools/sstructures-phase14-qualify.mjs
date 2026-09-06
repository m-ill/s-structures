/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/sstructures-phase14-qualify.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/sstructures-phase14-qualify.mjs', import.meta.url));
