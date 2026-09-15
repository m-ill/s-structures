// Shared by UI, WebMCP and project instructions. Rendering is not design approval.
export const REPORT_CONTRACT = Object.freeze({
  version: 'sstructures-report-contract-v1',
  templateVersion: 'general-structural-review-v1',
  rendererVersion: 'sstructures-vector-review-v1',
  locale: 'ko-KR', paper: 'A4', font: 'SStructuresSans',
  exportTool: 'export_report_pdf', sourceTool: 'get_report_artifact',
  workflow: ['plan_report_export','start_report_export','export_report_pdf'], resumeTool: 'open_report_artifact',
  detailExportTool: 'export_design_drawings',
  scope: 'preliminary-review-record', designTransferAllowed: false,
  instruction: 'Use the application report exporter for the recorded review. Do not substitute an independently authored PDF for the canonical report. Keep explanations and screenshots as identified supplements. Preserve input/result/snapshot hashes, KDS bases, NG and unchecked items. Detail drawings are a separate report type.',
});

export const REPORT_FONT_FAMILY = 'SStructuresSans';
const fontAsset = new URL('../../assets/fonts/phase24/SStructuresSans.ttf', import.meta.url);
// Node-produced HTML travels with a sibling font; never disclose local paths.
export const REPORT_FONT_URL = fontAsset.protocol === 'file:' ? 'sstructures-report-font.ttf' : fontAsset.href;
export const REPORT_FONT_CSS = `@font-face{font-family:SStructuresSans;src:url("${REPORT_FONT_URL}") format("truetype");font-weight:100 900;font-display:block}`;

export function getReportRuntimeQualification(target = {}) {
  if (target.SStructuresReportQualification) return target.SStructuresReportQualification;
  const adapter = target.sStructuresReportExport;
  const available = ['plan','run','status','cancel'].every(key => typeof adapter?.[key] === 'function');
  return {
    status: available ? 'READY' : 'BLOCKED',
    profile: 'runtime-report-adapter-v1', releaseQualified: false,
    artifactValidationRequired: true, engineeringVerdictCeiling: 'CONDITIONAL_PASS',
    reason: available ? 'ARTIFACT_VALIDATION_REQUIRED' : 'P11_REPORT_EXPORT_ADAPTER_UNAVAILABLE',
  };
}
