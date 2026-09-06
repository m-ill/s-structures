/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/runners/generate-strix21-comparison-report.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/runners/generate-strix21-comparison-report.mjs', import.meta.url));
