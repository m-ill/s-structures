(function installIndexMiddleMousePan() {
  'use strict';

  const canvas = document.getElementById('cv');
  if (!canvas) return;

  let drag = null;

  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function begin(event) {
    if (event.button !== 1) return;

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: [...ST.cam.target],
    };
    ST.drag = null;
    canvas.setPointerCapture(event.pointerId);
    consume(event);
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const worldPerPixel = ST.cam.dist / FOCAL;
    const dx = (event.clientX - drag.startX) * worldPerPixel;
    const dy = (event.clientY - drag.startY) * worldPerPixel;
    const basis = camBasis();
    ST.cam.target = vadd(
      vadd(drag.target, vscale(basis.r, -dx)),
      vscale(basis.u, dy),
    );
    draw();
    consume(event);
  }

  function end(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    drag = null;
    consume(event);
  }

  canvas.addEventListener('pointerdown', begin, { capture: true, passive: false });
  canvas.addEventListener('pointermove', move, { capture: true, passive: false });
  canvas.addEventListener('pointerup', end, { capture: true, passive: false });
  canvas.addEventListener('pointercancel', end, { capture: true, passive: false });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  canvas.addEventListener('auxclick', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  canvas.dataset.middlePanDirection = 'camera-x-reversed';
})();
