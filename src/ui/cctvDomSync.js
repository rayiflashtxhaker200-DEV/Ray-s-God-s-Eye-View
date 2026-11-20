import { t } from '../i18n/index.js';

function toggleClass(element, className, active) {
  if (typeof element?.classList?.toggle === 'function') {
    element.classList.toggle(className, Boolean(active));
  }
}

function syncDisabled(element, disabled) {
  if (element && 'disabled' in element) {
    element.disabled = Boolean(disabled);
  }
}

function setDatasetValue(element, key, value) {
  if (!element?.dataset) return;
  if (value) element.dataset[key] = value;
  else delete element.dataset[key];
}

function pickerSignature(picker) {
  if (!picker) return '';
  const options = Array.isArray(picker.options)
    ? picker.options.map((opt) => `${opt.value}\u0000${opt.label}`).join('\u0001')
    : '';
  return `${options}\u0002${picker.note || ''}`;
}

/**
 * Syncs Pinia `useCctvStore` and `useStatusStore().cctv` into the static
 * HTML templates (`#cctv-panel` and `#cctv-sync-chip`).
 */
export function mountCctvDomSync({ elements = {}, store, statusStore }) {
  if (!store || typeof store.$subscribe !== 'function') {
    return { destroy() {} };
  }

  let destroyed = false;
  let lastPickerSignature = null;
  const activeChipEdits = new WeakMap();
  const initialChipLabels = new WeakMap();

  const calReadout = elements._cctvCalReadout;
  if (typeof calReadout?.querySelectorAll === 'function') {
    for (const chip of calReadout.querySelectorAll('.cctv-cal-value')) {
      initialChipLabels.set(chip, chip.textContent || '');
    }
  }

  function syncPicker(picker) {
    const select = elements._cctvSelect;
    if (!select) return;
    syncDisabled(select, picker?.disabled);
    if (!picker) return;

    const sig = pickerSignature(picker);
    if (
      sig !== lastPickerSignature &&
      typeof select.ownerDocument?.createElement === 'function'
    ) {
      lastPickerSignature = sig;
      const doc = select.ownerDocument;
      const fragment = doc.createDocumentFragment();
      for (const option of picker.options || []) {
        const opt = doc.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        fragment.appendChild(opt);
      }
      if (picker.note) {
        const noteOpt = doc.createElement('option');
        noteOpt.value = '';
        noteOpt.disabled = true;
        noteOpt.setAttribute('data-cctv-outside', '');
        noteOpt.textContent = picker.note;
        fragment.appendChild(noteOpt);
      }
      if (typeof select.replaceChildren === 'function') {
        select.replaceChildren(fragment);
      } else {
        select.innerHTML = '';
        select.appendChild(fragment);
      }
    }

    const selection = picker.selection;
    if (!selection) return;
    if ('value' in selection) {
      if (select.value !== selection.value) select.value = selection.value;
    } else if (
      'index' in selection &&
      select.selectedIndex !== selection.index
    ) {
      select.selectedIndex = selection.index;
    }
  }

  function syncCalibrationChips(view, calEdit) {
    if (typeof calReadout?.querySelectorAll !== 'function') return;
    const chips = calReadout.querySelectorAll('.cctv-cal-value');
    for (const chip of chips) {
      const field = chip.dataset?.calField;
      if (!field) continue;
      const edit = calEdit?.field === field ? calEdit : null;
      if (edit) {
        syncDisabled(chip, false);
        const existingInput = chip.querySelector?.('.cctv-cal-input');
        if (existingInput && activeChipEdits.get(chip) === edit.finish) {
          continue;
        }
        const doc = chip.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (typeof doc?.createElement === 'function') {
          activeChipEdits.set(chip, edit.finish);
          const labelNode = doc.createTextNode(edit.label || '');
          const input = doc.createElement('input');
          input.type = 'number';
          input.className = 'gev-field gev-field--inline cctv-cal-input';
          input.step = edit.step || '1';
          if (edit.ariaLabel) input.setAttribute('aria-label', edit.ariaLabel);
          input.value = edit.value ?? '';
          input.addEventListener('click', (event) => {
            event.stopPropagation();
          });
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              edit.finish?.(true, input.value);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              edit.finish?.(false);
            }
            event.stopPropagation();
          });
          input.addEventListener('blur', () => {
            edit.finish?.(true, input.value);
          });
          if (typeof chip.replaceChildren === 'function') {
            chip.replaceChildren(labelNode, input);
          } else {
            chip.innerHTML = '';
            chip.appendChild(labelNode);
            chip.appendChild(input);
          }
          input.focus?.();
          input.select?.();
        }
        continue;
      }

      activeChipEdits.delete(chip);
      syncDisabled(chip, Boolean(view?.calibration?.disabled));
      const fallback = initialChipLabels.get(chip) || '';
      const nextText = view?.calibration?.values?.[field] ?? fallback;
      if (chip.querySelector?.('input') || chip.textContent !== nextText) {
        chip.textContent = nextText;
      }
    }
  }

  function syncView(view, calEdit) {
    if (view) {
      const enableBtn = elements._cctvEnableBtn;
      if (enableBtn) {
        enableBtn.textContent = view.enabled ? t('CCTV ON') : t('CCTV OFF');
        toggleClass(enableBtn, 'active', view.enabled);
        enableBtn.setAttribute?.('aria-pressed', String(Boolean(view.enabled)));
      }
      syncDisabled(elements._cctvNearestBtn, view.navDisabled);
      syncDisabled(elements._cctvPrevBtn, view.navDisabled);
      syncDisabled(elements._cctvNextBtn, view.navDisabled);
      syncDisabled(elements._cctvFocusBtn, view.focusDisabled);

      const pauseBtn = elements._cctvPauseBtn;
      if (pauseBtn) {
        const isPaused = Boolean(view.paused);
        syncDisabled(pauseBtn, view.focusDisabled);
        pauseBtn.setAttribute?.('aria-pressed', String(isPaused));
        toggleClass(pauseBtn, 'active', isPaused);
        toggleClass(pauseBtn, 'is-paused', isPaused);
        const label = isPaused
          ? t('Resume frame updates')
          : t('Pause frame updates');
        pauseBtn.title = label;
        pauseBtn.setAttribute?.('aria-label', label);
        const icon = pauseBtn.querySelector?.('.material-symbols-outlined');
        if (icon) {
          icon.textContent = isPaused ? 'play_arrow' : 'pause';
        }
      }

      const coverageBtn = elements._cctvCoverageBtn;
      if (coverageBtn) {
        syncDisabled(coverageBtn, view.toggleDisabled);
        toggleClass(coverageBtn, 'active', view.coverage?.active);
        coverageBtn.textContent = view.coverage?.text ?? t('COVERAGE OFF');
      }

      const autoHopBtn = elements._cctvAutoHopBtn;
      if (autoHopBtn) {
        syncDisabled(autoHopBtn, view.toggleDisabled);
        toggleClass(autoHopBtn, 'active', view.autoHop?.active);
        autoHopBtn.textContent = view.autoHop?.text ?? t('AUTO HOP OFF');
      }

      const projectionBtn = elements._cctvProjectionBtn;
      if (projectionBtn) {
        syncDisabled(projectionBtn, view.toggleDisabled);
        toggleClass(projectionBtn, 'active', view.projection?.active);
        projectionBtn.textContent =
          view.projection?.text ?? t('PROJECTION ON');
      }

      const qualityChip = elements._cctvQualityChip;
      if (qualityChip) {
        qualityChip.textContent = view.quality?.label ?? t('CAL · --');
        setDatasetValue(qualityChip, 'calBadge', view.quality?.calBadge || '');
      }

      if (elements._cctvMeta) {
        elements._cctvMeta.textContent = view.meta ?? '';
      }

      const adjustBtn = elements._cctvAdjustBtn;
      if (adjustBtn) {
        syncDisabled(adjustBtn, view.calibration?.disabled);
        toggleClass(adjustBtn, 'active', view.calibration?.adjust?.active);
        adjustBtn.textContent =
          view.calibration?.adjust?.text ?? t('ADJUST');
      }
      syncDisabled(elements._cctvCalibSaveBtn, view.calibration?.disabled);
      syncDisabled(elements._cctvCalibResetBtn, view.calibration?.disabled);
    }

    syncCalibrationChips(view, calEdit);
  }

  function syncMedia(frame, live) {
    const isLive = Boolean(live);
    const frameWrap = elements._cctvFrameWrap;
    if (frameWrap) {
      toggleClass(frameWrap, 'loading', Boolean(frame?.wrapLoading && !isLive));
      toggleClass(frameWrap, 'has-frame', Boolean(!isLive && frame?.hasFrame));
      toggleClass(
        frameWrap,
        'error',
        Boolean(!isLive && frame?.error && !frame?.hasFrame),
      );
    }

    const frameImg = elements._cctvFrame;
    if (frameImg) {
      if ('hidden' in frameImg) frameImg.hidden = isLive;
      const nextSrc = !isLive && frame?.src ? frame.src : '';
      if (nextSrc) {
        const currentAttr =
          typeof frameImg.getAttribute === 'function'
            ? frameImg.getAttribute('src')
            : frameImg.src;
        if (currentAttr !== nextSrc && frameImg.src !== nextSrc) {
          frameImg.src = nextSrc;
        }
      } else {
        frameImg.removeAttribute?.('src');
      }
      toggleClass(
        frameImg,
        'active',
        Boolean(!isLive && frame?.hasFrame && nextSrc),
      );
    }

    const videoCanvas = elements._cctvVideo;
    if (videoCanvas && 'hidden' in videoCanvas) {
      videoCanvas.hidden = !isLive;
    }
  }

  function syncSourceBadge(badge) {
    const badgeEl = elements._cctvSourceBadge;
    if (!badgeEl) return;
    badgeEl.textContent = badge?.label || t('SOURCE · UNKNOWN');
    if (badgeEl.dataset) {
      badgeEl.dataset.frameState = badge?.state || 'idle';
    }
  }

  function syncSummary(summary) {
    if (elements._cctvSummary && typeof summary === 'string') {
      elements._cctvSummary.textContent = summary;
    }
  }

  function syncCctvStore() {
    if (destroyed) return;
    syncView(store.view, store.calEdit);
    syncPicker(store.picker);
    syncMedia(store.frame, store.live);
    syncSourceBadge(store.sourceBadge);
    syncSummary(store.summary);
  }

  function syncStatusChip(chip) {
    if (destroyed) return;
    if (elements._cctvSyncChip) {
      toggleClass(elements._cctvSyncChip, 'visible', Boolean(chip?.visible));
    }
    if (elements._cctvSyncLabel && chip?.label) {
      if (elements._cctvSyncLabel.textContent !== chip.label) {
        elements._cctvSyncLabel.textContent = chip.label;
      }
    }
    if (elements._cctvSyncProgress && typeof chip?.progress === 'string') {
      if (elements._cctvSyncProgress.textContent !== chip.progress) {
        elements._cctvSyncProgress.textContent = chip.progress;
      }
    }
  }

  const unsubCctv = store.$subscribe(
    () => {
      syncCctvStore();
    },
    { flush: 'sync' },
  );

  const unsubStatus =
    statusStore && typeof statusStore.$subscribe === 'function'
      ? statusStore.$subscribe(
          () => {
            syncStatusChip(statusStore.cctv);
          },
          { flush: 'sync' },
        )
      : null;

  syncCctvStore();
  if (statusStore) syncStatusChip(statusStore.cctv);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubCctv?.();
      unsubStatus?.();
    },
  };
}
