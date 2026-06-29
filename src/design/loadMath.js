export function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : value;
}

export function finite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
