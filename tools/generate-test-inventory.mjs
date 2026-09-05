/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/harnesses/generate-test-inventory.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/harnesses/generate-test-inventory.mjs', import.meta.url));
