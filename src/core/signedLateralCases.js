export function signedAccidentalVariants(base) {
  return [
    { caseId: `${base}AP`, sign: 1, label: 'accidental plus' },
    { caseId: `${base}AN`, sign: -1, label: 'accidental minus' },
  ];
}

export function isSignedAccidentalCase(caseId) {
  return /A[PN]$/i.test(String(caseId || ''));
}

export function signedAccidentalSign(caseId) {
  return String(caseId || '').toUpperCase().endsWith('AN') ? 'accidental-minus' : 'accidental-plus';
}
