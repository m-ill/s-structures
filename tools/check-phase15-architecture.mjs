/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/harnesses/check-phase15-architecture.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/harnesses/check-phase15-architecture.mjs', import.meta.url));
