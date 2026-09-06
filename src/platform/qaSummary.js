export function qaSummary(items) {
  return {
    ok: items.every((item) => item.status === 'OK' || item.status === 'WARN'),
    okCount: count(items, 'OK'),
    warnCount: count(items, 'WARN'),
    ngCount: count(items, 'NG'),
  };
}

function count(items, status) {
  return items.filter((item) => item.status === status).length;
}
