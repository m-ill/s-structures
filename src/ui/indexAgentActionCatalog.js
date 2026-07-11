import { MODELING_ACTIONS } from './indexAgentActions.js';
import { NATIVE_ADVANCED_ACTIONS } from './indexNativeAdvancedAnalysis.js';
import { NATIVE_AGENT_CONTROL_ACTIONS } from './indexNativeAgentControls.js';
import { NATIVE_MODELER_ACTIONS } from './indexNativeModeler.js';
import { MATERIAL_LIBRARY_ACTIONS } from '../materials/libraryEdit.js';

export function availableAgentActions() {
  return [
    'runAnalysis',
    'setModel',
    'setAnalysisSetting',
    'setResultTab',
    'setPDeltaStep',
    'setViewerSlice',
    'setResultsPanelOpen',
    'setOverlayOption',
    'setOverlayMode',
    'setOverlayPDeltaStep',
    'focusEntity',
    'setPushoverOption',
    'setPushoverPanelOpen',
    'runPushover',
    'addAnalysisCase',
    'updateAnalysisCase',
    'deleteAnalysisCase',
    'listAnalysisCases',
    'runAnalysisCase',
    'runAnalysisCases',
    'runAllAnalysisCases',
    'getAnalysisCaseResult',
    'applyKdsLoadCombinations',
    'applyKdsRuleBasedLoadCombinations',
    'applyDesignBasisLoads',
    'setDesignBasisInput',
    ...MATERIAL_LIBRARY_ACTIONS,
    'openNativeDetailedReport',
    'openNativeCalculationPackage',
    'setNativeMode',
    'setNativePDeltaEnabled',
    'setNativePDeltaStep',
    'setNativeResultScale',
    'showNativeMemberResult',
    ...NATIVE_MODELER_ACTIONS,
    'loadNativeExample',
    'exportNativeBook',
    'importNativeBook',
    'saveNativeAutosave',
    'restoreNativeAutosave',
    ...NATIVE_AGENT_CONTROL_ACTIONS,
    ...NATIVE_ADVANCED_ACTIONS,
    'runNativeProductAudit',
    ...MODELING_ACTIONS,
  ];
}
