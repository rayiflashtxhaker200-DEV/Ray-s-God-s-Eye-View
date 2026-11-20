import { t } from '../i18n/index.js';

const CCTV_WIDE_KEY = 'gev:cctv:wide';
const CCTV_FIT_KEY = 'gev:cctv:fit';
const CCTV_WALL_KEY = 'gev:cctv:wall';
const ZOOM_STEPS = [1, 1.5, 2, 3];

function readPref(key, fallback = false) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function _applyCctvZoomDom() {
  const viewport = this._cctvStageViewport;
  const zoom = this._zoomLevel || 1;
  const panX = zoom > 1 ? this._panX || 0 : 0;
  const panY = zoom > 1 ? this._panY || 0 : 0;
  if (viewport) {
    viewport.style?.setProperty('--cctv-zoom', String(zoom));
    viewport.style?.setProperty('--cctv-pan-x', `${panX.toFixed(1)}px`);
    viewport.style?.setProperty('--cctv-pan-y', `${panY.toFixed(1)}px`);
    viewport.classList?.toggle('is-zoomed', zoom > 1);
  }
  if (this._cctvZoomBadge) {
    this._cctvZoomBadge.textContent = `${zoom}×`;
  }
  if (this._cctvZoomOutBtn) {
    this._cctvZoomOutBtn.disabled = zoom <= ZOOM_STEPS[0];
  }
  if (this._cctvZoomInBtn) {
    this._cctvZoomInBtn.disabled = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
}

export function _resetCctvZoom() {
  this._zoomLevel = 1;
  this._panX = 0;
  this._panY = 0;
  _applyCctvZoomDom.call(this);
}

function clampPan(viewport, zoom, panX, panY) {
  if (!viewport || zoom <= 1) return { x: 0, y: 0 };
  const maxX = Math.max(0, ((viewport.clientWidth || 320) * (zoom - 1)) / 2);
  const maxY = Math.max(0, ((viewport.clientHeight || 180) * (zoom - 1)) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, panX)),
    y: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

function stepZoom(controls, delta) {
  const current = controls._zoomLevel || 1;
  const idx = ZOOM_STEPS.indexOf(current);
  const nextIdx = Math.max(
    0,
    Math.min(ZOOM_STEPS.length - 1, (idx === -1 ? 0 : idx) + delta),
  );
  const nextZoom = ZOOM_STEPS[nextIdx];
  controls._zoomLevel = nextZoom;
  if (nextZoom <= 1) {
    controls._panX = 0;
    controls._panY = 0;
  } else {
    const clamped = clampPan(
      controls._cctvStageViewport,
      nextZoom,
      controls._panX || 0,
      controls._panY || 0,
    );
    controls._panX = clamped.x;
    controls._panY = clamped.y;
  }
  _applyCctvZoomDom.call(controls);
}

function applyWideState(controls, wide) {
  controls._widePanel = !!wide;
  controls._cctvPanel?.classList?.toggle('cctv-wide', controls._widePanel);
  if (controls._cctvWideBtn) {
    controls._cctvWideBtn.setAttribute?.(
      'aria-pressed',
      String(controls._widePanel),
    );
    controls._cctvWideBtn.classList?.toggle('active', controls._widePanel);
    const icon = controls._cctvWideBtn.querySelector?.('.material-symbols-outlined');
    if (icon) {
      icon.textContent = controls._widePanel ? 'close_fullscreen' : 'open_in_full';
    }
  }
  controls.actions?.syncViewport?.();
}

function applyFitState(controls, cover) {
  controls._fitCover = !!cover;
  controls._cctvFrameWrap?.classList?.toggle(
    'cctv-fit-cover',
    controls._fitCover,
  );
  if (controls._cctvFitBtn) {
    controls._cctvFitBtn.setAttribute?.(
      'aria-pressed',
      String(controls._fitCover),
    );
    controls._cctvFitBtn.classList?.toggle('active', controls._fitCover);
    controls._cctvFitBtn.textContent = controls._fitCover
      ? t('FILL')
      : t('FIT');
  }
}

function applyWallState(controls, open) {
  controls._wallOpen = !!open;
  if (controls._cctvWallGrid) {
    controls._cctvWallGrid.hidden = !controls._wallOpen;
  }
  if (controls._cctvWallBtn) {
    controls._cctvWallBtn.setAttribute?.(
      'aria-pressed',
      String(controls._wallOpen),
    );
    controls._cctvWallBtn.classList?.toggle('active', controls._wallOpen);
  }
}

function syncExpandButtonDom(controls) {
  const expanded = controls.isLightboxOpen?.() || false;
  controls._cctvFrameWrap?.classList?.toggle('cctv-lightbox', expanded);
  if (controls._cctvExpandBtn) {
    controls._cctvExpandBtn.setAttribute?.('aria-pressed', String(expanded));
    controls._cctvExpandBtn.classList?.toggle('active', expanded);
    const icon = controls._cctvExpandBtn.querySelector?.('.material-symbols-outlined');
    if (icon) {
      icon.textContent = expanded ? 'close_fullscreen' : 'open_in_full';
    }
  }
}

async function openLightbox(controls) {
  const wrap = controls._cctvFrameWrap;
  if (!wrap) return;
  if (typeof wrap.showPopover === 'function') {
    try {
      wrap.popover = 'auto';
      wrap.showPopover();
      controls._lightboxMode = 'popover';
      controls._popoverOpen = true;
      syncExpandButtonDom(controls);
      return;
    } catch {
      wrap.removeAttribute?.('popover');
    }
  }
  if (typeof wrap.requestFullscreen === 'function') {
    try {
      await wrap.requestFullscreen();
      controls._lightboxMode = 'fullscreen';
      syncExpandButtonDom(controls);
      return;
    } catch {
      /* fallback to CSS overlay */
    }
  }
  controls._lightboxMode = 'class';
  controls._classLightboxOpen = true;
  syncExpandButtonDom(controls);
}

export function _closeCctvLightbox() {
  const wrap = this._cctvFrameWrap;
  if (!wrap) return;
  if (this._popoverOpen && typeof wrap.hidePopover === 'function') {
    try {
      wrap.hidePopover();
    } catch {
      /* already closed */
    }
  }
  this._popoverOpen = false;
  if (
    typeof document !== 'undefined' &&
    document.fullscreenElement === wrap &&
    typeof document.exitFullscreen === 'function'
  ) {
    document.exitFullscreen().catch(() => {});
  }
  this._classLightboxOpen = false;
  wrap.classList?.remove('cctv-lightbox');
  syncExpandButtonDom(this);
}

export function _initCctvPanel() {
  if (!this._cctvPanel) return;

  this._widePanel = readPref(CCTV_WIDE_KEY, false);
  this._fitCover = readPref(CCTV_FIT_KEY, false);
  this._wallOpen = readPref(CCTV_WALL_KEY, false);
  this._filterQuery = '';
  this._zoomLevel = 1;
  this._panX = 0;
  this._panY = 0;

  applyWideState(this, this._widePanel);
  applyFitState(this, this._fitCover);
  applyWallState(this, this._wallOpen);
  _applyCctvZoomDom.call(this);

  const cycleCamera = async (delta, duration) => {
    const generation = ++this._actionGeneration;
    const activeId = this._cctvState?.activeCameraId;
    if (!(await this.actions.toggleEnabled(true))) return;
    if (
      this.destroyed ||
      generation !== this._actionGeneration ||
      !this.actions.isEnabled() ||
      (activeId && activeId !== this._cctvState?.activeCameraId)
    )
      return;
    this.actions.runExplicitFocus(
      () => this.cctv.cycleCamera(delta),
      (cameraId) => this.cctv.focusCamera(cameraId, duration),
    );
  };

  const focusActive = async (duration = 1.9) => {
    const generation = ++this._actionGeneration;
    const activeId = this._cctvState?.activeCameraId;
    const selected = this._cctvState?.activeCameraId || this._cctvSelect?.value;
    if (!selected) return;
    if (!(await this.actions.toggleEnabled(true))) return;
    if (
      this.destroyed ||
      generation !== this._actionGeneration ||
      !this.actions.isEnabled() ||
      (activeId && activeId !== this._cctvState?.activeCameraId)
    )
      return;
    this.actions.runExplicitFocus(
      () => selected,
      (cameraId) => this.cctv.focusCamera(cameraId, duration),
    );
    this.actions.setParams({ selectedCameraId: selected }, { origin: 'user' });
  };

  this.listen(this._cctvEnableBtn, 'click', async () => {
    this._actionGeneration++;
    await this.actions.toggleEnabled();
  });

  this.listen(this._cctvNearestBtn, 'click', async () => {
    const generation = ++this._actionGeneration;
    const activeId = this._cctvState?.activeCameraId;
    if (!(await this.actions.toggleEnabled(true))) return;
    if (
      this.destroyed ||
      generation !== this._actionGeneration ||
      !this.actions.isEnabled() ||
      (activeId && activeId !== this._cctvState?.activeCameraId)
    )
      return;
    this.actions.runExplicitFocus(
      () => this.cctv.focusNearest({ focus: false }),
      (cameraId) => this.cctv.focusCamera(cameraId, 1.8),
    );
  });

  this.listen(this._cctvPrevBtn, 'click', () => cycleCamera(-1, 1.4));
  this.listen(this._cctvNextBtn, 'click', () => cycleCamera(1, 1.4));
  this.listen(this._cctvLbPrevBtn, 'click', () => cycleCamera(-1, 1.4));
  this.listen(this._cctvLbNextBtn, 'click', () => cycleCamera(1, 1.4));

  // The picker defers rebuilds while focused; catch up once it lets go.
  this.listen(this._cctvSelect, 'blur', () => {
    this._picker = null;
    this._renderCctvState(this._cctvState);
  });

  this.listen(this._cctvSelect, 'change', async () => {
    const generation = ++this._actionGeneration;
    const activeId = this._cctvState?.activeCameraId;
    const cameraId = this._cctvSelect.value;
    if (!cameraId) return;
    if (!(await this.actions.toggleEnabled(true))) return;
    if (
      this.destroyed ||
      generation !== this._actionGeneration ||
      !this.actions.isEnabled() ||
      (activeId && activeId !== this._cctvState?.activeCameraId)
    )
      return;
    // Picking a camera from the dropdown flies to it.
    this.actions.runExplicitFocus(
      () => (this.cctv.selectCamera(cameraId) ? cameraId : null),
      (selectedId) => this.cctv.focusCamera(selectedId, 2.2),
    );
    this.actions.setParams({ selectedCameraId: cameraId }, { origin: 'user' });
  });

  this.listen(this._cctvFocusBtn, 'click', () => focusActive(1.9));
  this.listen(this._cctvLbFocusBtn, 'click', async () => {
    this._closeCctvLightbox();
    await focusActive(1.9);
  });

  this.listen(this._cctvWideBtn, 'click', (event) => {
    event?.stopPropagation?.();
    const next = !this._widePanel;
    applyWideState(this, next);
    writePref(CCTV_WIDE_KEY, next);
  });

  this.listen(this._cctvFitBtn, 'click', () => {
    const next = !this._fitCover;
    applyFitState(this, next);
    writePref(CCTV_FIT_KEY, next);
  });

  this.listen(this._cctvZoomInBtn, 'click', () => stepZoom(this, 1));
  this.listen(this._cctvZoomOutBtn, 'click', () => stepZoom(this, -1));

  this.listen(this._cctvPauseBtn, 'click', () => {
    this.setFeedPaused?.(!this._feedPaused);
  });

  this.listen(this._cctvRefreshBtn, 'click', () => {
    this._refreshActiveCctvFrame?.();
  });
  this.listen(this._cctvRetryBtn, 'click', () => {
    this._refreshActiveCctvFrame?.();
  });

  this.listen(this._cctvExpandBtn, 'click', () => {
    if (this.isLightboxOpen()) this._closeCctvLightbox();
    else openLightbox(this);
  });
  this.listen(this._cctvLbCloseBtn, 'click', () => this._closeCctvLightbox());

  if (this._cctvFrameWrap) {
    this.listen(this._cctvFrameWrap, 'toggle', (event) => {
      this._popoverOpen = event.newState === 'open';
      if (!this._popoverOpen) {
        this._cctvFrameWrap.removeAttribute?.('popover');
      }
      syncExpandButtonDom(this);
      this._renderCctvState(this._cctvState);
    });
  }

  if (typeof document !== 'undefined') {
    this.listen(document, 'fullscreenchange', () => {
      syncExpandButtonDom(this);
      this._renderCctvState(this._cctvState);
    });
    this.listen(
      document,
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !this.isLightboxOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        this._closeCctvLightbox();
      },
      { capture: true },
    );
  }

  if (this._cctvStageViewport) {
    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originPanX = 0;
    let originPanY = 0;

    this.listen(this._cctvStageViewport, 'dblclick', () => {
      if ((this._zoomLevel || 1) > 1) {
        this._resetCctvZoom();
      } else {
        this._zoomLevel = 2;
        _applyCctvZoomDom.call(this);
      }
    });

    this.listen(this._cctvStageViewport, 'pointerdown', (event) => {
      if ((this._zoomLevel || 1) <= 1 || event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originPanX = this._panX || 0;
      originPanY = this._panY || 0;
      this._cctvStageViewport.setPointerCapture?.(pointerId);
      this._cctvStageViewport.classList?.add('is-panning');
    });

    this.listen(this._cctvStageViewport, 'pointermove', (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const clamped = clampPan(
        this._cctvStageViewport,
        this._zoomLevel || 1,
        originPanX + (event.clientX - startX),
        originPanY + (event.clientY - startY),
      );
      this._panX = clamped.x;
      this._panY = clamped.y;
      _applyCctvZoomDom.call(this);
    });

    const endDrag = (event) => {
      if (!dragging || (pointerId !== null && event.pointerId !== pointerId))
        return;
      dragging = false;
      this._cctvStageViewport.releasePointerCapture?.(pointerId);
      pointerId = null;
      this._cctvStageViewport.classList?.remove('is-panning');
    };
    this.listen(this._cctvStageViewport, 'pointerup', endDrag);
    this.listen(this._cctvStageViewport, 'pointercancel', endDrag);

    this.listen(
      this._cctvStageViewport,
      'wheel',
      (event) => {
        if (!this.isLightboxOpen() && (this._zoomLevel || 1) <= 1 && !event.ctrlKey)
          return;
        event.preventDefault();
        stepZoom(this, event.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  this.listen(this._cctvWallBtn, 'click', () => {
    const next = !this._wallOpen;
    applyWallState(this, next);
    writePref(CCTV_WALL_KEY, next);
    this._renderCctvState(this._cctvState);
  });

  this.listen(this._cctvWallGrid, 'click', async (event) => {
    const card = event.target?.closest?.('[data-cctv-wall-id]');
    const cameraId = card?.dataset?.cctvWallId;
    if (!cameraId) return;
    const generation = ++this._actionGeneration;
    if (!(await this.actions.toggleEnabled(true))) return;
    if (
      this.destroyed ||
      generation !== this._actionGeneration ||
      !this.actions.isEnabled()
    )
      return;
    this.actions.runExplicitFocus(
      () => (this.cctv.selectCamera(cameraId) ? cameraId : null),
      (selectedId) => this.cctv.focusCamera(selectedId, 1.8),
    );
    this.actions.setParams({ selectedCameraId: cameraId }, { origin: 'user' });
  });

  this.listen(this._cctvFilterInput, 'input', () => {
    this._filterQuery = this._cctvFilterInput.value || '';
    if (this._cctvFilterClear) {
      this._cctvFilterClear.hidden = !this._filterQuery.trim();
    }
    this._picker = null;
    this._renderCctvState(this._cctvState);
  });

  this.listen(this._cctvFilterClear, 'click', () => {
    if (this._cctvFilterInput) {
      this._cctvFilterInput.value = '';
      this._cctvFilterInput.focus?.();
    }
    this._filterQuery = '';
    if (this._cctvFilterClear) this._cctvFilterClear.hidden = true;
    this._picker = null;
    this._renderCctvState(this._cctvState);
  });

  this.listen(this._cctvCoverageBtn, 'click', () => {
    const current =
      this._cctvState?.coverageMode ||
      (this._cctvState?.showCoverage ? 'on' : 'off');
    const next =
      current === 'off' ? 'on' : current === 'on' ? 'viewshed' : 'off';
    this.actions.setParams({ coverageMode: next }, { origin: 'user' });
  });

  this.listen(this._cctvAutoHopBtn, 'click', () => {
    const current = !!this._cctvState?.autoHop;
    this.actions.setParams({ autoHop: !current }, { origin: 'user' });
  });

  this.listen(this._cctvProjectionBtn, 'click', () => {
    const current = this._cctvState?.showProjection !== false;
    this.actions.setParams({ showProjection: !current }, { origin: 'user' });
  });

  this.listen(this._cctvAdjustBtn, 'click', (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const current = !!this._cctvState?.calibrationMode;
    this.actions.setParams({ calibrationMode: !current }, { origin: 'user' });
  });

  // Click-to-edit pose readout: each chip swaps to a number input; Enter or
  // blur commits (converted to a calibration offset against basePose),
  // Escape cancels. Delegated so re-renders never re-bind.
  this.listen(this._cctvCalReadout, 'click', (event) => {
    const chip = event.target.closest?.('.cctv-cal-value');
    if (!chip || chip.disabled || chip.querySelector('input')) return;
    this._beginCctvCalValueEdit(chip);
  });

  this.listen(this._cctvCalibSaveBtn, 'click', () => {
    const cameraId = this._activeCctvCameraId();
    if (!cameraId || !this.actions.setParams) return;
    this.actions.setParams(
      {
        selectedCameraId: cameraId,
        calibration: { cameraId, save: true },
      },
      { origin: 'user' },
    );
    this.actions.showToast(t('CCTV calibration saved'));
  });

  this.listen(this._cctvCalibResetBtn, 'click', () => {
    this._resetCctvCalibration();
  });

  this._renderCctvState(null);
  this.actions.syncViewport();
}
