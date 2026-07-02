export const DWG_ADAPTER_VERSION = 'p3-m7-dwg-adapter';
export const DWG_CONVERTER_MISSING = 'IMPORT_DWG_CONVERTER_MISSING';

export function createDwgConversionPlan(input = {}) {
  const converterPath = input.converterPath || input.config?.converterPath || null;
  return {
    version: DWG_ADAPTER_VERSION,
    inputPath: input.inputPath || null,
    outputDir: input.outputDir || null,
    converterPath,
    targetFormat: input.targetFormat || 'ACAD2018_ASCII_DXF',
    canRun: !!converterPath && !!input.inputPath,
    missingReason: converterPath ? null : DWG_CONVERTER_MISSING,
    guidance: converterPath ? null : 'Install ODA File Converter or export the drawing as ASCII DXF from CAD.',
  };
}

export function createDwgMissingConverterResult(input = {}) {
  const plan = createDwgConversionPlan(input);
  return {
    ok: false,
    version: DWG_ADAPTER_VERSION,
    code: DWG_CONVERTER_MISSING,
    plan,
    message: plan.guidance,
  };
}
