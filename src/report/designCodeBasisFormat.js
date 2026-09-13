// Formatting of recorded metadata only; never resolve rules or calculate here.
export function formatDesignCodeBasis(basis,locale='ko-KR') {
 const ko=locale==='ko-KR',applied=basis?.applied||[],targets=basis?.reviewTargets||[];
 const label=applied.length?(ko?'KDS 조항 적용':'KDS clause applied'):(ko?'KDS 적용 근거 미확정':'KDS application not established');
 const rows=(applied.length?applied:targets).map(ref=>`${ref.code}:${ref.edition} ${ref.name||''} ${ref.clause}\n${ref.url}\nSHA256 ${ref.sha256}`);
 return [label,...rows,!applied.length?(basis?.reason||(ko?'검증된 조항 연결 없음':'No verified clause mapping')):null].filter(Boolean).join('\n');
}
