import { getLocale, keepCodesWithValues, msg, t, tn } from '../i18n/index.js';
import {
  _syncCctvFrameDom,
  cctvSourceLabelText,
  cctvSourceMessageText,
} from './cctvFrames.js';

import { createCctvVideoSurface } from './cctvVideo.js';
import { presentCctvCalibration } from './cctvCalibration.js';
import { roundHeadingDegrees } from '../data/headingDegrees.js';
export function _calBadgeLabel(badge) {
  switch (badge) {
    case 'calibrated':
      return t('CALIBRATED');
    case 'curated':
      return t('CURATED');
    case 'raw-prior':
      return t('RAW PRIOR');
    default:
      return '--';
  }
}

/** A picker option for a camera. */
function pickerOption(camera, id = camera.id) {
  return { value: id, label: `${camera.city} · ${camera.name}` };
}

/** Filter cameras by city, name, provider label, or id. */
function filterCameras(cameras, rawQuery) {
  const query = String(rawQuery || '')
    .trim()
    .toLowerCase();
  if (!query) return cameras;
  return cameras.filter((camera) => {
    const haystack = [
      camera.city,
      camera.name,
      camera.sourceLabel,
      camera.provider,
      camera.id,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** The picker's closing line for the cameras the view leaves out. */
function outsideNoteText(count) {
  return tn(
    count,
    '{count} more camera outside this view · pan or zoom out',
    '{count} more cameras outside this view · pan or zoom out',
  );
}

/**
 * The panel's buttons, CAL chip and meta line for a camera state, as the CCTV
 * panel view renders them. Pure: the picker, frame, source badge, calibration
 * readout and summary stay with the controls.
 * @param {object|null} state Camera layer UI state.
 * @param {boolean} enabled Whether the layer is on.
 */
export function presentCctvPanel(state, enabled, paused = false) {
  const cameras = state?.cameraIndex || state?.cameras || [];
  const catalogCount = Number.isFinite(state?.count)
    ? state.count
    : cameras.length;
  const activeId = state?.activeCameraId || '';
  const activeCamera = state?.activeCamera || null;
  // Tri-state (viewshed design §3b): off → on (wireframes) → viewshed
  // (color-coded volumes). The click handler cycles; this renders.
  const coverage = state?.coverageMode || (state?.showCoverage ? 'on' : 'off');
  const autoHop = !!state?.autoHop;
  const showProjection = state?.showProjection !== false;
  // CAL badge (cctv-v2 design §3b, amended by LOCKED §9.2 — panel-only, no
  // in-world tint): three states from cctv.js's deriveCalBadge. Unsaved live
  // edits show EDITED over the persisted state (viewshed design §3e): SAVE
  // CAL promotes to CALIBRATED, RESET CAL clears.
  const badge = activeCamera?.calBadge || null;
  const dirty = !!activeCamera?.calDirty;
  return {
    enabled,
    paused: Boolean(enabled && activeId && paused),
    navDisabled: !enabled || catalogCount === 0,
    focusDisabled: !enabled || catalogCount === 0 || !activeId,
    toggleDisabled: !enabled,
    coverage: {
      active: coverage !== 'off',
      text:
        coverage === 'viewshed'
          ? t('VIEWSHED ON')
          : coverage === 'on'
            ? t('COVERAGE ON')
            : t('COVERAGE OFF'),
    },
    autoHop: {
      active: autoHop,
      text: autoHop ? t('AUTO HOP ON') : t('AUTO HOP OFF'),
    },
    projection: {
      active: showProjection,
      text: showProjection ? t('PROJECTION ON') : t('PROJECTION OFF'),
    },
    quality: {
      label: dirty
        ? t('CAL · EDITED (UNSAVED)')
        : t('CAL · {badge}', { badge: _calBadgeLabel(badge) }),
      calBadge: dirty ? 'edited' : badge || '',
    },
    meta: metaText(state, enabled, activeCamera, catalogCount),
    calibration: presentCctvCalibration(state, enabled),
  };
}

function metaText(state, enabled, activeCamera, catalogCount) {
  if (activeCamera) {
    const provider = cctvSourceLabelText(
      activeCamera.sourceLabel || activeCamera.provider || 'Configured Source',
    );
    const statusMsg = activeCamera.sourceMessage
      ? ` · ${cctvSourceMessageText(activeCamera.sourceMessage)}`
      : '';
    // A partner-supplied feed inside a pack names its owner here.
    const credit = activeCamera.credit ? ` · ${activeCamera.credit}` : '';
    const calBadge = activeCamera.calBadge
      ? _calBadgeLabel(activeCamera.calBadge)
      : '';
    const projLabel = state?.showProjection !== false ? t('MONITOR') : t('OFF');
    return keepCodesWithValues(
      t(
        '{city} · HDG {heading} · FOV {fov} · RANGE {range}m · {projection}{calBadge} · {provider}{status}',
        {
          city: activeCamera.city,
          heading: `${roundHeadingDegrees(Number(activeCamera.headingDeg)) ?? 0}°`,
          fov: `${Math.round(activeCamera.fovDeg)}°`,
          range: Math.round(activeCamera.rangeM),
          projection: projLabel,
          calBadge: calBadge ? ` · ${calBadge}` : '',
          provider,
          status: `${credit}${statusMsg}`,
        },
      ),
    );
  }
  if (catalogCount > 0)
    return enabled
      ? tn(
          catalogCount,
          '{count} camera loaded · click a camera to activate',
          '{count} cameras loaded · click a camera to activate',
        )
      : tn(
          catalogCount,
          '{count} camera loaded · enable CCTV to activate',
          '{count} cameras loaded · enable CCTV to activate',
        );
  return t('Enable CCTV to load camera intersections');
}

function syncPickerSelectDom(selectEl, picker, disabled, activeId) {
  if (!selectEl || typeof selectEl.replaceChildren !== 'function') return;
  const options = picker?.options || [];
  const note = picker?.note || '';
  const signature = `${getLocale()}|${note}|${options.map((o) => `${o.value}:${o.label}`).join('\n')}`;
  if (selectEl._cctvOptionsSig !== signature) {
    selectEl._cctvOptionsSig = signature;
    const nodes = options.map((entry) => {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      return opt;
    });
    if (note) {
      const noteOpt = document.createElement('option');
      noteOpt.value = '';
      noteOpt.disabled = true;
      noteOpt.textContent = note;
      nodes.push(noteOpt);
    }
    selectEl.replaceChildren(...nodes);
  }
  selectEl.disabled = !!disabled;
  if (activeId) {
    selectEl.value = activeId;
  } else {
    selectEl.selectedIndex = options.length === 0 && note ? 0 : -1;
  }
}

function createWallCard(camera, activeId, controls) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'cctv-wall-card';
  card.dataset.cctvWallId = camera.id;
  if (camera.id === activeId) {
    card.classList.add('is-active');
    card.setAttribute('aria-current', 'true');
  }

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'cctv-wall-thumb-wrap';

  if (camera.frameUrl) {
    const img = document.createElement('img');
    img.className = 'cctv-wall-thumb';
    img.alt = `${camera.city || ''} ${camera.name || ''}`.trim();
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.dataset.src = camera.frameUrl;
    img.addEventListener('load', () => {
      thumbWrap.classList.add('is-loaded');
    });
    img.addEventListener('error', () => {
      thumbWrap.classList.add('is-broken');
    });
    if (controls._wallObserver) {
      controls._wallObserver.observe(img);
    } else {
      img.src = camera.frameUrl;
    }
    thumbWrap.appendChild(img);
  } else {
    thumbWrap.classList.add('is-broken');
  }

  const fallback = document.createElement('span');
  fallback.className = 'material-symbols-outlined cctv-wall-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = 'videocam';
  thumbWrap.appendChild(fallback);

  if (camera.isVideo) {
    const liveBadge = document.createElement('span');
    liveBadge.className = 'cctv-wall-badge is-live';
    liveBadge.textContent = t('LIVE');
    thumbWrap.appendChild(liveBadge);
  }

  const caption = document.createElement('span');
  caption.className = 'cctv-wall-caption';
  const cityEl = document.createElement('span');
  cityEl.className = 'cctv-wall-city';
  cityEl.textContent = camera.city || '';
  const nameEl = document.createElement('span');
  nameEl.className = 'cctv-wall-name';
  nameEl.textContent = camera.name || camera.id;
  caption.append(cityEl, nameEl);

  card.append(thumbWrap, caption);
  return card;
}

function renderWallGrid(grid, filteredCameras, enabled, activeId, controls) {
  if (!grid || !controls._wallOpen || typeof document === 'undefined') return;

  if (!enabled) {
    if (grid.dataset.wallState !== 'disabled') {
      grid.dataset.wallState = 'disabled';
      controls._renderedWallSig = '';
      const empty = document.createElement('div');
      empty.className = 'cctv-wall-empty';
      empty.textContent = t('Enable CCTV to inspect live feeds');
      grid.replaceChildren(empty);
    }
    return;
  }

  const slice = filteredCameras.slice(0, 12);
  if (slice.length === 0) {
    if (grid.dataset.wallState !== 'empty') {
      grid.dataset.wallState = 'empty';
      controls._renderedWallSig = '';
      const empty = document.createElement('div');
      empty.className = 'cctv-wall-empty';
      empty.textContent = t('No cameras match this filter');
      grid.replaceChildren(empty);
    }
    return;
  }

  grid.dataset.wallState = 'cards';
  const wallSig = slice.map((c) => `${c.id}:${c.isVideo ? 1 : 0}`).join('|');
  if (controls._renderedWallSig !== wallSig) {
    controls._renderedWallSig = wallSig;
    controls._wallObserver?.disconnect();
    if (typeof IntersectionObserver !== 'undefined' && !controls._wallObserver) {
      controls._wallObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const img = entry.target;
            if (img.dataset.src && !img.getAttribute('src')) {
              img.src = img.dataset.src;
            }
            controls._wallObserver?.unobserve(img);
          }
        },
        { root: grid, rootMargin: '60px' },
      );
    }
    const cards = slice.map((cam) => createWallCard(cam, activeId, controls));
    grid.replaceChildren(...cards);
    return;
  }

  // Same cards: update active state only so thumbnails never flicker.
  grid.querySelectorAll('.cctv-wall-card').forEach((card) => {
    const isCurrent = card.dataset.cctvWallId === activeId;
    card.classList.toggle('is-active', isCurrent);
    if (isCurrent) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
}

function syncPanelDom(
  state,
  enabled,
  presentation,
  cameras,
  filteredCameras,
  catalogCount,
  liveIntent,
) {
  const activeId = state?.activeCameraId || '';
  const activeCamera = state?.activeCamera || null;

  if (this._cctvEnableBtn) {
    this._cctvEnableBtn.textContent = enabled ? t('CCTV ON') : t('CCTV OFF');
    this._cctvEnableBtn.classList?.toggle('active', enabled);
    this._cctvEnableBtn.setAttribute?.('aria-pressed', String(enabled));
  }
  if (this._cctvNearestBtn) {
    this._cctvNearestBtn.disabled = presentation.navDisabled;
  }
  if (this._cctvPrevBtn) {
    this._cctvPrevBtn.disabled = presentation.navDisabled;
  }
  if (this._cctvNextBtn) {
    this._cctvNextBtn.disabled = presentation.navDisabled;
  }
  if (this._cctvFocusBtn) {
    this._cctvFocusBtn.disabled = presentation.focusDisabled;
  }
  if (this._cctvPauseBtn) {
    const isPaused = Boolean(presentation.paused);
    this._cctvPauseBtn.disabled = presentation.focusDisabled;
    this._cctvPauseBtn.setAttribute?.('aria-pressed', String(isPaused));
    this._cctvPauseBtn.classList?.toggle('active', isPaused);
    this._cctvPauseBtn.classList?.toggle('is-paused', isPaused);
    const label = isPaused
      ? t('Resume frame updates')
      : t('Pause frame updates');
    this._cctvPauseBtn.title = label;
    this._cctvPauseBtn.setAttribute?.('aria-label', label);
    const icon = this._cctvPauseBtn.querySelector?.('.material-symbols-outlined');
    if (icon) {
      icon.textContent = isPaused ? 'play_arrow' : 'pause';
    }
  }
  if (this._cctvRefreshBtn) {
    this._cctvRefreshBtn.disabled = presentation.focusDisabled;
  }
  if (this._cctvLbPrevBtn) {
    this._cctvLbPrevBtn.disabled = presentation.navDisabled;
  }
  if (this._cctvLbNextBtn) {
    this._cctvLbNextBtn.disabled = presentation.navDisabled;
  }
  if (this._cctvLbFocusBtn) {
    this._cctvLbFocusBtn.disabled = presentation.focusDisabled;
  }
  if (this._cctvCoverageBtn) {
    this._cctvCoverageBtn.textContent = presentation.coverage.text;
    this._cctvCoverageBtn.classList?.toggle('active', presentation.coverage.active);
    this._cctvCoverageBtn.disabled = presentation.toggleDisabled;
  }
  if (this._cctvAutoHopBtn) {
    this._cctvAutoHopBtn.textContent = presentation.autoHop.text;
    this._cctvAutoHopBtn.classList?.toggle('active', presentation.autoHop.active);
    this._cctvAutoHopBtn.disabled = presentation.toggleDisabled;
  }
  if (this._cctvProjectionBtn) {
    this._cctvProjectionBtn.textContent = presentation.projection.text;
    this._cctvProjectionBtn.classList?.toggle(
      'active',
      presentation.projection.active,
    );
    this._cctvProjectionBtn.disabled = presentation.toggleDisabled;
  }
  if (this._cctvQualityChip) {
    this._cctvQualityChip.textContent = presentation.quality.label;
    if (this._cctvQualityChip.dataset) {
      this._cctvQualityChip.dataset.calBadge = presentation.quality.calBadge;
    }
  }
  if (this._cctvMeta) {
    this._cctvMeta.textContent = presentation.meta;
  }
  if (this._cctvAdjustBtn) {
    this._cctvAdjustBtn.textContent = presentation.calibration.adjust.text;
    this._cctvAdjustBtn.classList?.toggle(
      'active',
      presentation.calibration.adjust.active,
    );
    this._cctvAdjustBtn.disabled = presentation.calibration.disabled;
  }
  if (this._cctvCalibSaveBtn) {
    this._cctvCalibSaveBtn.disabled = presentation.calibration.disabled;
  }
  if (this._cctvCalibResetBtn) {
    this._cctvCalibResetBtn.disabled = presentation.calibration.disabled;
  }
  if (this._cctvCalReadout?.querySelectorAll) {
    this._cctvCalReadout.querySelectorAll('.cctv-cal-value').forEach((chip) => {
      chip.disabled = presentation.calibration.disabled;
      if (chip.querySelector('input')) return;
      const key = chip.dataset?.calField;
      if (key && key in presentation.calibration.values) {
        chip.textContent = presentation.calibration.values[key];
      }
    });
  }
  if (state?.calibrationMode && this._cctvCalDetails && !this._cctvCalDetails.open) {
    this._cctvCalDetails.open = true;
  }
  if (this._cctvStageLiveDot) {
    this._cctvStageLiveDot.hidden = !liveIntent || Boolean(presentation.paused);
  }
  if (this._cctvStageLabel) {
    if (enabled && activeCamera) {
      const prefix = `${activeCamera.city} · ${activeCamera.name}`;
      if (presentation.paused) {
        this._cctvStageLabel.textContent = `${prefix} · ${t('PAUSED')}`;
      } else {
        this._cctvStageLabel.textContent = liveIntent
          ? `${prefix} · ${t('LIVE')}`
          : prefix;
      }
    } else {
      this._cctvStageLabel.textContent = t('STANDBY');
    }
  }
  this._cctvFrameWrap?.classList?.toggle(
    'is-paused',
    Boolean(enabled && activeCamera && presentation.paused),
  );
  if (this._cctvLbMeta) {
    if (enabled && activeCamera) {
      const hdg = roundHeadingDegrees(Number(activeCamera.headingDeg)) ?? 0;
      this._cctvLbMeta.textContent = `${activeCamera.city} · ${activeCamera.name} · HDG ${hdg}°`;
    } else {
      this._cctvLbMeta.textContent = '';
    }
  }
  if (this._cctvCountChip) {
    const shown = this._filterQuery ? filteredCameras.length : cameras.length;
    this._cctvCountChip.textContent = enabled
      ? `${shown} / ${catalogCount}`
      : `0 / ${catalogCount}`;
  }
  if (this._cctvVideo) {
    this._cctvVideo.hidden = !liveIntent;
  }
  if (this._cctvFrame && 'hidden' in this._cctvFrame) {
    this._cctvFrame.hidden = liveIntent || !this._frame?.hasFrame;
  }
  renderWallGrid(this._cctvWallGrid, filteredCameras, enabled, activeId, this);
}

export function _renderCctvState(state) {
  if (this.destroyed) return;
  if (
    !state?.enabled ||
    !this.actions.isEnabled() ||
    state?.activeCameraId !== this._cctvState?.activeCameraId
  ) {
    this._calibrationEdit?.(false);
  }
  this._cctvState = state || null;
  // The light index, not `state.cameras`: reading that builds every camera's
  // full state, which a large catalog cannot afford on each notification.
  const cameras = state?.cameraIndex || state?.cameras || [];
  // The picker lists what is in view; the catalog is every camera.
  const catalogCount = Number.isFinite(state?.count)
    ? state.count
    : cameras.length;
  const enabled = !!state?.enabled && !!this.actions.isEnabled();
  const activeId = state?.activeCameraId || '';
  const activeCamera = state?.activeCamera || null;
  const filteredCameras = filterCameras(cameras, this._filterQuery);

  // Auto-expand the panel when the active camera CHANGES to a new non-null
  // id while the layer is enabled. Covers click-on-globe, panel controls,
  // and voice (selectCamera/cycleCamera/focusNearest all notify through
  // this subscription). The last-seen guard keeps routine notifications
  // from re-expanding a panel the user deliberately collapsed, and timed
  // auto-hop transitions only expand on the first activation so the panel
  // does not pop open on every hop.
  const effectiveActiveId = enabled ? activeId || null : null;
  const isFirstActivation = this._lastSeenCctvActiveId === null;
  if (effectiveActiveId !== this._lastZoomCameraId) {
    this._lastZoomCameraId = effectiveActiveId;
    this._feedPaused = false;
    this._resetCctvZoom?.();
  }
  if (
    effectiveActiveId &&
    effectiveActiveId !== this._lastSeenCctvActiveId &&
    (!state?.autoHop || isFirstActivation)
  ) {
    this.actions.setPanelCollapsed('cctv-panel', false, {
      explicit: Boolean(state?.explicitSelection),
    });
  }
  this._lastSeenCctvActiveId = effectiveActiveId;

  this._updateCctvSyncChip(state?.loading, enabled);

  if (this._cctvSelect) {
    // A focused picker keeps the options it shows; blur re-renders it. One
    // about to be disabled cannot hold focus, so it does not count.
    const disabled = !enabled || (cameras.length === 0 && !this._filterQuery);
    const picking =
      typeof document !== 'undefined' &&
      document.activeElement === this._cctvSelect &&
      !disabled;
    // Cameras the view leaves out get one closing line, so a short list
    // does not read as the whole catalog. A disabled layer has no view.
    const outside = enabled ? Math.max(0, catalogCount - cameras.length) : 0;
    const pickerList =
      activeCamera &&
      activeId &&
      !filteredCameras.some((cam) => cam.id === activeId)
        ? [activeCamera, ...filteredCameras]
        : filteredCameras;
    let picker = this._picker;
    // The index keeps its identity until the view, filter, or locale changes.
    if (
      !picking &&
      (picker?.source !== cameras ||
        picker.filterQuery !== (this._filterQuery || '') ||
        picker.outside !== outside ||
        picker.locale !== getLocale())
    ) {
      picker = {
        source: cameras,
        filterQuery: this._filterQuery || '',
        outside,
        locale: getLocale(),
        options: pickerList.map((camera) => pickerOption(camera)),
        note: outside ? outsideNoteText(outside) : '',
      };
    } else if (
      picking &&
      activeId &&
      activeCamera &&
      !picker?.options.some((option) => option.value === activeId)
    ) {
      // A deferred rebuild can miss a camera activated meanwhile (auto-hop,
      // voice); add it so the picker does not go blank. It is one fewer
      // outside the view.
      const options = [
        pickerOption(activeCamera, activeId),
        ...(picker?.options || []),
      ];
      const left = Math.max(0, catalogCount - options.length);
      picker = {
        ...picker,
        options,
        note: picker?.note && left ? outsideNoteText(left) : '',
      };
    }
    this._picker = picker;
    const pickerState = {
      options: picker?.options || [],
      note: picker?.note || '',
      disabled: !enabled || (picker?.options?.length || 0) === 0,
      // The active camera is always one of the listed records. With nothing
      // active the closed picker shows the note when nothing is in view; a
      // focused picker keeps its old options, so it only clears.
      selection:
        activeId && activeCamera
          ? { value: activeId }
          : !activeId
            ? { index: !picking && cameras.length === 0 && outside ? 0 : -1 }
            : null,
    };
    this.store.setPicker(pickerState);
    if (!picking) {
      syncPickerSelectDom(
        this._cctvSelect,
        picker,
        pickerState.disabled,
        activeId && activeCamera ? activeId : '',
      );
    }
  }

  const presentation = presentCctvPanel(state, enabled, this._feedPaused);
  this.store.publish(presentation);

  const liveIntent = enabled && !!activeCamera?.isVideo;
  this.store.setLive(liveIntent);
  if (this._cctvVideo) {
    const visible =
      liveIntent &&
      !document.hidden &&
      (!this._cctvPanel?.classList.contains('collapsed') ||
        this.isLightboxOpen?.());
    if (!visible || this._cctvVideoCameraId !== activeId) {
      this._cctvVideoSurface?.stop();
      this._cctvVideoSurface = null;
    }
    this._cctvVideoCameraId = activeId;
    if (visible && !this._cctvVideoSurface) {
      this._cctvVideoSurface = createCctvVideoSurface(
        this._cctvVideo,
        () => this.cctv.getActiveVideoElement?.(),
        { paused: !!this._feedPaused },
      );
    } else {
      this._cctvVideoSurface?.setPaused?.(!!this._feedPaused);
    }
  }

  if (this._cctvFrame && !liveIntent) {
    const nextSrc = enabled ? activeCamera?.frameUrl : null;
    const nextCameraId = enabled ? activeCamera?.id || '' : '';
    const cameraChanged = this._frame.cameraId !== nextCameraId;
    const frameLoading = this._frame.loading;
    // A same-camera refresh waits for the current image to settle. Replacing
    // src every 10 seconds can cancel a slow but healthy decode forever and
    // leave SNAPSHOT · OK beside a blank/loading preview. Camera changes are
    // immediate so navigation never waits on the prior camera's request.
    if (
      nextSrc &&
      (cameraChanged ||
        (!this._feedPaused && !frameLoading && this._frame.currentSrc !== nextSrc))
    ) {
      this._queueCctvFrame(nextSrc, nextCameraId, cameraChanged);
    }
    if (!nextSrc) {
      this._clearCctvFrame();
    }
  } else if (liveIntent) {
    this._clearCctvFrame();
  }

  _syncCctvFrameDom.call(this);
  syncPanelDom.call(
    this,
    state,
    enabled,
    presentation,
    cameras,
    filteredCameras,
    catalogCount,
    liveIntent,
  );

  this._syncCctvSourceBadge(activeCamera, enabled);
  this._typeCctvSummary(
    state?.summary ||
      t('Enable CCTV to start camera-linked intelligence summaries.'),
  );
}

export function _typeCctvSummary(text) {
  if (this.destroyed || !this._cctvSummary) return;
  const nextText = String(text || '').trim() || t('No summary available.');
  if (nextText === this._lastCctvSummaryText) return;
  this._lastCctvSummaryText = nextText;

  clearInterval(this._cctvSummaryTypingTimer);
  this.store.setSummary('');
  this._cctvSummary.textContent = '';
  let idx = 0;
  this._cctvSummaryTypingTimer = setInterval(() => {
    if (this.destroyed) return;
    idx += 3;
    if (idx >= nextText.length) {
      this.store.setSummary(nextText);
      if (this._cctvSummary) this._cctvSummary.textContent = nextText;
      clearInterval(this._cctvSummaryTypingTimer);
      this._cctvSummaryTypingTimer = null;
      return;
    }
    const slice = nextText.slice(0, idx);
    this.store.setSummary(slice);
    if (this._cctvSummary) this._cctvSummary.textContent = slice;
  }, 20);
}

/** Publish a change to the camera grid chip; its label stays while hidden. */
export function _publishCctvChip(patch) {
  const current = this._cctvChip ?? {
    visible: false,
    labelKey: msg('loading frames'),
    immediate: false,
    progress: '0/0',
    stopped: false,
  };
  // The chip keeps its English key, so a new locale shows it again; the
  // view gets the label alone.
  const next = { ...current, ...patch };
  next.label = t(next.labelKey);
  if (
    this._cctvChip &&
    Object.keys(next).every((key) => next[key] === current[key])
  )
    return;
  this._cctvChip = next;
  const { labelKey, ...chip } = next;
  this.statusStore.publishCctv(chip);
}

export function _updateCctvSyncChip(loading, enabled) {
  if (this.destroyed) return;
  const total = Number(loading?.total) || 0;
  const loaded = Math.max(0, Math.min(Number(loading?.loaded) || 0, total));
  const busy = !!enabled && !!loading?.active && total > 0;

  if (busy) {
    clearTimeout(this._cctvChipHideTimer);
    this._cctvChipHideTimer = null;
    this._cctvChipWasBusy = true;
    // The counter is left plain on purpose: it ticks every few frames
    // during a grid load, and flapping it would read as a slot machine.
    this._publishCctvChip({
      visible: true,
      labelKey: msg('loading frames'),
      progress: `${loaded}/${total}`,
    });
    return;
  }

  if (this._cctvChipWasBusy && enabled && total > 0) {
    // Load just completed — flash the final count, then auto-hide.
    this._cctvChipWasBusy = false;
    this._publishCctvChip({
      visible: true,
      labelKey: msg('camera grid ready'),
      progress: `${total}/${total}`,
    });
    clearTimeout(this._cctvChipHideTimer);
    this._cctvChipHideTimer = window.setTimeout(() => {
      if (this.destroyed) return;
      this._cctvChipHideTimer = null;
      this._publishCctvChip({ visible: false });
    }, 1500);
    return;
  }

  if (!this._cctvChipHideTimer) {
    this._cctvChipWasBusy = false;
    this._publishCctvChip({ visible: false });
  }
}
