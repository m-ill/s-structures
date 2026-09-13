export const checkIncomplete=row=>row?.incomplete===true||row?.locationCoverage?.complete===false||['NOT_CHECKED','WARN','FAILED'].includes(row?.status);
