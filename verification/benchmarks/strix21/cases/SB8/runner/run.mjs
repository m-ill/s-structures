import { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';

await runP17CaseCli({ expectedCaseId: 'SB8', invokedUrl: import.meta.url });
