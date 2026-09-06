import { runP17CaseContract } from '../../../../../tests/phase17/run-case-contract.mjs';

await runP17CaseContract({ expectedCaseId: 'SM6', invokedUrl: import.meta.url });
