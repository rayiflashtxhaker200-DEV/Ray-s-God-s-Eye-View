// MAP STACK source chips — the always-visible replacement for the `<select>`
// that used to sit in the Map Stack panel. One chip model per stack, from
// `MapStackController.getStacks()`; the dock renders them. The approved sources
// below are the whole shipped set; keeping the allowlist explicit means a stack
// added to `MAP_STACKS` for another purpose cannot reach the tray until someone
// names it here.
//
// The chips are a control SURFACE only: selecting one calls
// `createMapSourceControls().select()`, the path `_setMapStack()` uses, and the
// active state is re-synced from controller state (never optimistically), so a
// failed or superseded switch still leaves the truly-active stack lit.

import { keySetupRequirementEnvVars } from './keySetupCore.mjs';
import { t } from './i18n/index.js';

export const PRESENTED_MAP_STACK_IDS = Object.freeze([
  'photoreal',
  'bing-aerial',
  'bing-labels',
  'esri-imagery',
  'osm',
]);

/**
 * Presentation model for one map-stack chip.
 *
 * Unavailable is NOT the same as needs-an-ion-token: `photoreal` is unavailable
 * whenever the Google tileset failed to load (the startup fallback-to-OSM
 * case), and a future stack may have its own reason. The ION badge is therefore
 * gated on the stack's own `requiresIon` flag, and the tooltip quotes the
 * controller's `unavailableReason` rather than assuming one.
 * @param {{id: string, label: string, available?: boolean, requiresIon?: boolean, unavailableReason?: string|null}} stack - Stack descriptor from `getStacks()`.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {{id: string, label: string, available: boolean, active: boolean, requiresIon: boolean, requirement: string, unavailableHint: string, title: string}}
 */
export function mapStackChipModel(stack, activeId) {
  const available = stack?.available !== false;
  const label = String(stack?.label ?? stack?.id ?? '');
  const requiresIon = stack?.requiresIon === true;
  // Stack labels are provider names and stay English; the sentence translates.
  const fallbackReason = requiresIon
    ? t('Needs {envVars} — add it in Provider Settings', {
        envVars: keySetupRequirementEnvVars('cesium-ion'),
      })
    : t('{label} is unavailable', {
        label: label || t('This map stack'),
      });
  const unavailableHint = available
    ? ''
    : String(stack?.unavailableReason || fallbackReason);
  return {
    id: String(stack?.id ?? ''),
    label,
    available,
    active: !!stack?.id && stack.id === activeId,
    requiresIon,
    // Dropdown parity: unavailable options read "<label> · ion key". A chip has
    // no room for that, so an ion-backed stack gets a compact badge; every
    // unavailable chip carries the real reason in its tooltip.
    requirement: !available && requiresIon ? 'ION' : '',
    unavailableHint,
    title: available ? label : unavailableHint,
  };
}

export const MAP_STACK_CHIP_CLASS = 'map-stack-chip';

/**
 * @param {Array<object>} stacks - `MapStackController.getStacks()` output.
 * @param {string|null} activeId - Currently active stack id.
 * @returns {Array<object>} One chip model per approved presentation id, in
 *   `PRESENTED_MAP_STACK_IDS` order; unlisted stacks stay outside this presentation.
 */
export function mapStackChipModels(stacks, activeId) {
  const stacksById = new Map(
    (Array.isArray(stacks) ? stacks : []).map((stack) => [stack?.id, stack]),
  );
  return PRESENTED_MAP_STACK_IDS.map((id) => stacksById.get(id))
    .filter(Boolean)
    .map((stack) => mapStackChipModel(stack, activeId));
}

export function renderMapStackChips(
  container,
  stacks,
  { activeId = null, onSelect, bind } = {},
) {
  if (!container) return [];
  const doc = container.ownerDocument || globalThis.document;
  if (!doc?.createElement) return [];
  container.innerHTML = '';
  const attach =
    typeof bind === 'function'
      ? bind
      : (el, type, handler) => el.addEventListener(type, handler);
  const models = mapStackChipModels(stacks, activeId);
  const chips = [];
  for (const model of models) {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = MAP_STACK_CHIP_CLASS;
    chip.disabled = false;
    chip.dataset.stackId = model.id;
    chip.title = model.title;
    chip.classList.toggle('active', model.active);
    chip.classList.toggle('unavailable', !model.available);
    chip.setAttribute('aria-pressed', String(model.active));
    if (!model.available) {
      chip.setAttribute('aria-disabled', 'true');
      chip.setAttribute(
        'aria-label',
        `${model.label} unavailable: ${model.unavailableHint}`,
      );
    }
    const labelEl = doc.createElement('span');
    labelEl.className = 'map-stack-chip-label';
    labelEl.textContent = model.label;
    chip.appendChild(labelEl);
    if (model.requirement) {
      const reqEl = doc.createElement('span');
      reqEl.className = 'map-stack-chip-req';
      reqEl.textContent = model.requirement;
      chip.appendChild(reqEl);
    }
    attach(chip, 'click', () => {
      if (!model.available) return;
      onSelect?.(model.id);
    });
    container.appendChild(chip);
    chips.push(chip);
  }
  return chips;
}

export function syncMapStackChips(container, activeId) {
  if (!container) return;
  const chips = container.children || [];
  for (const chip of chips) {
    const id = chip?.dataset?.stackId;
    const isActive =
      Boolean(id) &&
      id === activeId &&
      !chip.classList?.contains('unavailable');
    chip.classList?.toggle('active', isActive);
    chip.setAttribute?.('aria-pressed', String(isActive));
  }
}

