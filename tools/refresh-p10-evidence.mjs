/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/refresh-p10-evidence.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/refresh-p10-evidence.mjs', import.meta.url));
