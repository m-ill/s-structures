import {PRACTICAL_RULE_IMPLEMENTATIONS,PRACTICAL_RULE_PACK_HASH} from './practicalRuleImplementations.js';
import {KDS_CLAUSE_INDEX} from './kdsClauseIndex.js';
import {KDS_REFERENCE_TOKENS} from './kdsReferenceTokens.js';
import {getKcscRuleSources} from './kcscRuleSources.js';
import {PHASE25_GAPS} from './phase25GapOwners.js';
import {KCSC_PUBLIC_SOURCES} from './kcscPublicSources.js';
const profiles=['ordinary','intermediate','special'].map(system=>({id:`RC-KDS-${system.toUpperCase()}`,system,scope:'nonprestressed-rectangular-rc-frame-and-isolated-footing',methods:['off','direct'],implementation:'PARTIAL',productionQualified:false}));
const requiredSources=[
 {id:'building-loads',name:'건축물 설계하중',code:'KDS 41 12 00',status:'OFFICIAL_EDITION_CAPTURED_RULE_IMPLEMENTATION_PENDING'},
 {id:'building-seismic',name:'건축물 내진설계',code:'KDS 41 17 00',status:'OFFICIAL_EDITION_CAPTURED_RULE_IMPLEMENTATION_PENDING'},
 {id:'shallow-foundation',name:'얕은기초·지반',code:'KDS 11 50 05',status:'OFFICIAL_EDITION_CAPTURED_RULE_IMPLEMENTATION_PENDING'},
 {id:'rebar-product',name:'KS 철근 제품·공칭 면적·연성',status:'MANUFACTURER_TABLE_CAPTURED_KS_EDITION_AND_CERTIFICATE_PENDING'},
];
// Method-selection contract only; numerical owners still validate all inputs.
const serviceabilityMethods=[
 {id:'instant-live-curvature',axialForceSupported:false,biaxialBendingSupported:false,postAttachmentDeflection:false,nonstructuralDamageSensitiveAllowed:false,requiredSources:['unfactored-live','total-service-including-all-dead'],requiredFields:['serviceCrackingComboId','serviceBoundary','serviceDeflectionLimit','nonstructuralDamageSensitive'],basis:'regional effective inertia and relative curvature integration',methodReviewRequired:false},
 {id:'long-term-curvature',axialForceSupported:false,biaxialBendingSupported:false,postAttachmentDeflection:true,requiredSources:['unfactored-live','total-service-including-all-dead','sustained-dead-and-common-live-fraction'],requiredFields:['serviceCrackingComboId','serviceSustainedComboId','serviceDurationMonths','serviceLoadSequence','serviceBoundary','serviceDeflectionLimit','nonstructuralDamageSensitive'],conditionalFields:[{field:'servicePreAttachmentReference',when:'servicePreAttachmentMultiplier > 0'}],durationMonths:[3,6,12],durationAtLeastMonths:60,loadSequence:'sustained-before-attachment',basis:'KDS additional-long-term multiplier with reference-section compression reinforcement; regional effective inertia',methodReviewRequired:false},
 {id:'instant-live-frame',axialForceSupported:true,biaxialBendingSupported:true,postAttachmentDeflection:false,nonstructuralDamageSensitiveAllowed:false,requiredSources:['matching-total-and-dead-baseline-rc-splice-frame-or-refined-kds-direct'],requiredFields:['serviceCrackingComboId','serviceBaselineComboId','serviceDeflectionAxis','serviceBoundary','serviceDeflectionLimit','nonstructuralDamageSensitive'],basis:'relative frame field difference before extrema; no creep or loading-history acceptance',methodReviewRequired:true},
].map(row=>({...row,automaticFallbackAllowed:false,designTransferAllowed:false,scope:'method input contract; material, geometry, combinations and code checks remain required'}));
export function getDesignRuleCatalog() {
 return structuredClone({version:'p25-rule-catalog-v5-service-methods',serviceabilityMethods,rebarProducts:getRebarProductCatalog(),rulePackHash:PRACTICAL_RULE_PACK_HASH,rules:PRACTICAL_RULE_IMPLEMENTATIONS,profiles,
  documents:KDS_CLAUSE_INDEX.map(row=>({...getKcscRuleSources([row.id])[0],clauses:[...row.clauses],sourceIndexSha256:row.sha256,verificationScope:'clause-heading-existence-only'})),
  publicCaptures:KCSC_PUBLIC_SOURCES,requiredSources,gaps:PHASE25_GAPS,designTransferAllowed:false});
}
export function referenceClauseExists(ref) {
 const doc=KDS_CLAUSE_INDEX.find(x=>x.id===ref?.id&&x.sha256===ref.sha256);
 if(!doc||typeof ref.clause!=='string')return false;
 if(ref.documentPart!==undefined&&!['main','appendix'].includes(ref.documentPart))return false;
 const appendix=ref.documentPart==='appendix',headings=appendix?doc.appendixClauses:doc.clauses;
 const tokens=[...ref.clause.matchAll(/(?<!\d)(\d+(?:\.\d+)+-\d+)(?!\d)/g)].map(x=>x[1]),registry=KDS_REFERENCE_TOKENS.find(x=>x.id===ref.id&&x.sha256===ref.sha256);
 const equationTokens=appendix?registry?.appendixTokens:registry?.tokens;
 if(tokens.some(token=>!equationTokens?.includes(token)))return false;
 const primary=ref.clause,matches=[...primary.matchAll(/(?<![\d.])(\d+(?:\.\d+)+)(?![\d.])/g)].map(x=>x[1]);
 // Equations/tables have their own registry verification; here only explicit
 // leading clause headings qualify. Bare numbers or invented headings fail.
 return /^\d+\.\d+/.test(primary)&&matches.length>0&&matches.every(id=>headings?.includes(id));
}
import {getRebarProductCatalog} from '../materials/rebarProductCatalog.js';
