import { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';

await runP17CaseCli({ expectedCaseId: 'SB3', invokedUrl: import.meta.url });
