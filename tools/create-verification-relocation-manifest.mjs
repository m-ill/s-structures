/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/harnesses/create-verification-relocation-manifest.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/harnesses/create-verification-relocation-manifest.mjs', import.meta.url));
