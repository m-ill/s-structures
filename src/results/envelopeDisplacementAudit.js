export function envelopeDisplacementAudit(analysis) {
  const row = analysis?.envelope?.governing?.maxDisplacement || null;
  return {
    available: !!row,
    comboId: row?.comboId || null,
    comboName: row?.comboName || null,
    value: row?.value || 0,
  };
}
