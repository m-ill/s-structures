export function issueRow(source, severity, message, target = null) {
  const text = typeof message === 'string' ? message : message.message || message.code || String(message);
  const id = `${source}:${target || text}`.replace(/\s+/g, '-').slice(0, 80);
  return { id, source, target, severity, message: text, action: actionFor(severity) };
}

function actionFor(severity) {
  if (severity === 'NG') return 'Resolve before design approval.';
  if (severity === 'WARN') return 'Review and accept or revise.';
  return 'Record for traceability.';
}
