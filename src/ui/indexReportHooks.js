export function installDetailedReportMenuHook(target, bridge) {
  const doc = target?.document;
  const button = doc?.getElementById?.('mDesignReport');
  if (!button?.addEventListener) return null;
  button.addEventListener('click', () => {
    try {
      showDetailedReport(target, bridge, { source: 'native-menu' });
    } catch (error) {
      console.warn('[S-Structures] Detailed report failed.', error);
    }
  });
  return {
    version: 'm36-detailed-report-menu-hook',
    controlId: 'mDesignReport',
  };
}

export function installCalculationPackageMenuHook(target, bridge) {
  const doc = target?.document;
  if (!doc?.createElement) return null;
  const menu = doc.getElementById?.('menuDrop');
  if (!menu?.appendChild) return null;
  let button = doc.getElementById?.('mCalculationPackage');
  if (!button) {
    button = doc.createElement('button');
    button.id = 'mCalculationPackage';
    button.setAttribute?.('id', 'mCalculationPackage');
    button.type = 'button';
    button.textContent = 'Calculation Package';
    const after = doc.getElementById?.('mDesignReport');
    if (after?.parentNode === menu && menu.insertBefore) {
      const children = Array.from(menu.children || []);
      const afterIndex = children.indexOf(after);
      const before = afterIndex >= 0 ? children[afterIndex + 1] : null;
      menu.insertBefore(button, before || null);
    } else {
      menu.appendChild(button);
    }
  }
  button.setAttribute?.('data-agent-id', 'mCalculationPackage');
  if (!button.getAttribute?.('aria-label')) button.setAttribute?.('aria-label', 'Open calculation package');
  button.addEventListener?.('click', () => {
    try {
      showCalculationPackage(target, bridge, { source: 'native-menu' });
    } catch (error) {
      console.warn('[S-Structures] Calculation package failed.', error);
    }
  });
  return {
    version: 'm43-calculation-package-menu-hook',
    controlId: 'mCalculationPackage',
  };
}

export function openNativeDetailedReport(target, bridge, api, payload = {}) {
  const detailedReport = showDetailedReport(target, bridge, payload);
  return {
    ...api.getSnapshot(),
    detailedReport,
  };
}

export function openNativeCalculationPackage(target, bridge, api, payload = {}) {
  const calculationPackage = showCalculationPackage(target, bridge, payload);
  return {
    ...api.getSnapshot(),
    calculationPackage,
  };
}

export function showDetailedReport(target, bridge, options = {}) {
  const report = bridge?.getDetailedReport?.(options);
  if (!report) throw new Error('Detailed report is not available.');
  target.SStructuresDetailedReport = report;
  const doc = target?.document;
  const body = doc?.getElementById?.('reportBody');
  if (body) body.innerHTML = report.html;
  const modal = doc?.getElementById?.('reportModal');
  modal?.classList?.add?.('show');
  return {
    version: report.data?.version || null,
    title: report.data?.title || null,
    htmlLength: report.html?.length || 0,
    memberCheckCount: report.data?.memberChecks?.length || 0,
    actionItemCount: report.data?.actionItems?.length || 0,
    modalOpen: !!modal?.classList?.contains?.('show'),
  };
}

export function showCalculationPackage(target, bridge, options = {}) {
  const report = bridge?.getCalculationPackage?.(options);
  if (!report) throw new Error('Calculation package is not available.');
  target.SStructuresCalculationPackage = report;
  const doc = target?.document;
  const body = doc?.getElementById?.('reportBody');
  if (body) body.innerHTML = report.html;
  const modal = doc?.getElementById?.('reportModal');
  modal?.classList?.add?.('show');
  return {
    version: report.data?.version || null,
    title: report.data?.title || null,
    htmlLength: report.html?.length || 0,
    sectionCount: report.data?.sections?.length || 0,
    auditOk: !!report.data?.qualityAudit?.ok,
    modalOpen: !!modal?.classList?.contains?.('show'),
  };
}
