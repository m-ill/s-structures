import { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';

await runP17CaseCli({ expectedCaseId: 'SM5', invokedUrl: import.meta.url });
