/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/run-strix21-first-batch.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/run-strix21-first-batch.mjs', import.meta.url));
