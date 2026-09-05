import { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';

await runP17CaseCli({ expectedCaseId: 'TH1', invokedUrl: import.meta.url });
