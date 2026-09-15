import {REPORT_CONTRACT} from '../report/reportContract.js';

export const AGENT_START_GUIDE = Object.freeze({
  version: 'sstructures-agent-start-v1',
  scope: 'App workflow guidance within the user task; does not override host instructions or grant permissions.',
  first: 'Read get_agent_start_context, then get_project_context and relevant tool schemas before acting. Re-read after reconnect or input changes.',
  toolPolicy: {
    preferred: 'Use discovered WebMCP tools for supported application operations.',
    browser: 'Use available browser tools for visual inspection, screenshots and UI operations missing from WebMCP.',
    computer: 'Use computer tools only if provided by the host and a native desktop operation is needed.',
    failures: 'Do not bypass permission, stale-input or validation failures through another channel. Report missing capabilities accurately.',
  },
  workflow: ['Read project instructions and saved state','Inspect current model and required inputs','Ask the human about missing data and design choices','Run only authorized analysis/design changes','Check numerical results and capture the visible model','Export the canonical report and record unresolved items'],
  permissions: {missingData:'ask-human',designDecisions:'human',publication:'human',installFiles:'user-authorized-project-only'},
  resume: 'Use .sstructures/state.json and records in the connected project when accessible. The website cannot read an arbitrary local folder or change agent memory.',
  reportContract: REPORT_CONTRACT,
});

export function getAgentStartContext({agent,bridge}) {
  const model=agent?.getModel?.();
  return {
    ...structuredClone(AGENT_START_GUIDE),
    current: {
      modelAvailable: !!model,
      counts: model ? Object.fromEntries(['nodes','members','loads'].map(key=>[key,model[key]?.length||0])) : null,
      inputIdentity: bridge?.getWorkflowInputIdentity?.() || null,
      caseCount: model?.analysisCases?.length || 0,
      // User decisions reside in the authorized project, not inferred from geometry.
      humanDecisions: 'Read connected project records; not established by this tool.',
    },
    nextTools: ['get_project_context','get_workflow_context','get_design_modules'],
  };
}
