async (page) => {
  const root = 'C:/Users/mill/Downloads/dcr/S-Structures-main/output/playwright/strix21-ui-capture';
  const filter = '';
  const zoomClicks = { SB7: 1, SB8: 3, PD1: 2 };
  const rows = [
    ['SB2', 'front'], ['SB3', 'front'], ['SB5', 'plan'], ['SB6', 'plan'], ['SB7', 'front'],
    ['SB8', 'front'], ['SB9', 'front'], ['SB10', 'front'], ['SB12', '3d'], ['PD1', 'front'],
    ['SM5', 'front'], ['SM5b', '3d'], ['SM6', '3d'], ['SR1', 'front'], ['SR2', '3d'],
    ['SR2b', '3d'], ['P3S2', 'front'], ['SP1', 'front'], ['SH1', '3d'], ['TH1', 'front'],
  ];
  const requested = filter ? new Set(filter.split(',').map((value) => value.trim().toUpperCase())) : null;
  const cases = requested ? rows.filter(([id]) => requested.has(id)) : rows;
  const captures = [];

  page.on('dialog', async (dialog) => {
    try { await dialog.accept(); } catch {}
  });
  await page.setViewportSize({ width: 1600, height: 900 });

  for (const [id, view] of cases) {
    const bookPath = `${root}/models/${id}-S-Structures-book-R4.json`;
    await page.locator('#fileInput').setInputFiles(bookPath);
    await page.waitForFunction((caseId) => window.SStructuresEngine?.getCurrentModel?.()?.meta?.benchmarkId === caseId, id, { timeout: 15000 });
    await page.getByRole('tab', { name: '모델링', exact: true }).click();
    if (view === 'plan') await page.getByRole('button', { name: '평면', exact: true }).click();
    else if (view === 'front') await page.getByRole('button', { name: '정면', exact: true }).click();
    else await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.locator('#navFit').evaluate((element) => element.click());
    await page.waitForTimeout(350);
    await page.locator('#navFit').evaluate((element) => element.click());
    await page.waitForTimeout(350);
    for (let zoom = 0; zoom < (zoomClicks[id] || 0); zoom += 1) {
      await page.locator('#navZoomIn').evaluate((element) => element.click());
      await page.waitForTimeout(120);
    }
    const shotPath = `${root}/${id}/${id}_S-Structures_실제모델링_R4.png`;
    await page.screenshot({ path: shotPath, type: 'png' });
    const snapshot = await page.evaluate(() => {
      const model = window.SStructuresEngine?.getCurrentModel?.() || null;
      return {
        agentAvailable: Boolean(window.SStructuresAgent),
        engineAvailable: Boolean(window.SStructuresEngine),
        model: model ? {
          id: model.meta?.id || null,
          name: model.meta?.name || null,
          benchmarkId: model.meta?.benchmarkId || null,
          verificationBoundary: model.meta?.verificationBoundary || null,
          nodes: model.nodes?.length || 0,
          members: model.members?.length || 0,
          shells: model.shells?.length || 0,
          links: model.links?.length || 0,
          loads: model.loads?.length || 0,
          analysisCases: model.analysisCases?.map((item) => ({ id: item.id, kind: item.kind })) || [],
        } : null,
      };
    });
    captures.push({ id, view, shotPath, snapshot });
  }
  return { captured: captures.length, cases: captures };
}
