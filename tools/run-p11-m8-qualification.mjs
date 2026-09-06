/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/run-p11-m8-qualification.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/run-p11-m8-qualification.mjs', import.meta.url));
