import { runP17CaseContract } from '../../../../../tests/phase17/run-case-contract.mjs';

await runP17CaseContract({ expectedCaseId: 'SB12', invokedUrl: import.meta.url });
