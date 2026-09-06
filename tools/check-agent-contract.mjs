/**
 * Phase 16 compatibility launcher.
 * Canonical owner: verification/harnesses/check-agent-contract.mjs
 * Removal gate: package-command-major-version-migration
 */
import { runCompatibilityCli } from '../verification/harnesses/compatibility-launcher.mjs';
await runCompatibilityCli(new URL('../verification/harnesses/check-agent-contract.mjs', import.meta.url));
