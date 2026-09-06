/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/measure-scale-limits.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/measure-scale-limits.mjs', import.meta.url));
