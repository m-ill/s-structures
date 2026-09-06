export function practicePlatformSummary(workflow, qa, importExport) {
  return {
    status: qa.summary.ngCount ? 'NG' : qa.summary.warnCount ? 'WARN' : 'OK',
    revision: workflow.project.revision,
    approvalState: workflow.review.approvalState,
    qaOk: qa.summary.ok,
    importSourceCount: importExport.sources.length,
  };
}
