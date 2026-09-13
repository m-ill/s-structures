// Exercise the existing post-commit failure/retry scenario explicitly in the focused runner.
const previous=process.env.P25_RETRY;
process.env.P25_RETRY='1';
try { await import('./p25-m6-apply-review.mjs'); }
finally { if(previous===undefined)delete process.env.P25_RETRY;else process.env.P25_RETRY=previous; }
