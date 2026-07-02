export const DWG_ADAPTER_VERSION = 'p3-m7-dwg-adapter';
export const DWG_CONVERTER_MISSING = 'IMPORT_DWG_CONVERTER_MISSING';
export const DWG_CONVERSION_FAILED = 'IMPORT_DWG_CONVERSION_FAILED';

export function createDwgConversionPlan(input = {}) {
  const converterPath = input.converterPath || input.config?.converterPath || null;
  const inputPath = input.inputPath || null;
  const inputDir = input.inputDir || dirname(inputPath) || '.';
  const outputDir = input.outputDir || inputDir || null;
  const outputFileName = input.outputFileName || replaceExtension(basename(inputPath), '.dxf');
  const outputPath = outputDir && outputFileName ? joinPath(outputDir, outputFileName) : null;
  const targetFormat = input.targetFormat || 'ACAD2018_ASCII_DXF';
  const command = converterPath && inputDir && outputDir ? {
    executable: converterPath,
    args: [inputDir, outputDir, targetFormat, 'DXF', input.recursive ? '1' : '0', input.audit ? '1' : '0'],
    inputFileName: basename(inputPath),
    outputPath,
  } : null;
  return {
    version: DWG_ADAPTER_VERSION,
    inputPath,
    inputDir,
    outputDir,
    outputPath,
    converterPath,
    targetFormat,
    canRun: !!command && !!inputPath,
    command,
    missingReason: converterPath ? null : DWG_CONVERTER_MISSING,
    guidance: converterPath ? null : 'Install ODA File Converter or export the drawing as ASCII DXF from CAD.',
    audit: {
      sourceFormat: 'DWG',
      targetFormat: 'ASCII_DXF',
      requiresExternalConverter: true,
      executableConfigured: !!converterPath,
      targetPathKnown: !!outputPath,
    },
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

export function createDwgConversionFailureResult(input = {}, error = {}) {
  const plan = input.plan || createDwgConversionPlan(input);
  const message = error.message || input.message || 'DWG conversion failed. Export an ASCII DXF from CAD and retry.';
  return {
    ok: false,
    version: DWG_ADAPTER_VERSION,
    code: DWG_CONVERSION_FAILED,
    plan,
    message,
    stderr: error.stderr || input.stderr || null,
    exitCode: Number.isFinite(error.exitCode) ? error.exitCode : null,
  };
}

function basename(path) {
  const text = String(path || '').replace(/\\/g, '/');
  return text.split('/').filter(Boolean).pop() || null;
}

function dirname(path) {
  const text = String(path || '').replace(/\\/g, '/');
  const parts = text.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  const prefix = /^[A-Za-z]:/.test(text) ? '' : text.startsWith('/') ? '/' : '';
  return `${prefix}${parts.slice(0, -1).join('/')}`;
}

function joinPath(dir, file) {
  if (!dir) return file || null;
  if (!file) return dir;
  if (dir === '.') return file;
  return `${String(dir).replace(/[\\/]+$/, '')}/${file}`;
}

function replaceExtension(file, ext) {
  if (!file) return null;
  return String(file).replace(/\.[^.\\/]*$/, '') + ext;
}
