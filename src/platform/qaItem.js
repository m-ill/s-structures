export function qaItem(id, label, ok, warn = false, note = '') {
  return {
    id,
    label,
    status: ok ? 'OK' : warn ? 'WARN' : 'NG',
    note,
  };
}
