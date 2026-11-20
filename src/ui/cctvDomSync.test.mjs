import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPinia } from 'pinia';
import { CctvControls } from './cctvControls.js';
import { useCctvStore } from './stores/cctv.js';
import { useStatusStore } from './stores/status.js';
import { createPresentation } from '../layers/cctv/presentation.js';
import { createModel } from '../layers/cctv/model.js';

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (name) => set.has(name),
    toggle(name, force) {
      const next = force === undefined ? !set.has(name) : Boolean(force);
      if (next) set.add(name);
      else set.delete(name);
      return next;
    },
  };
}

function createFakeElement(tagName = 'div', doc = null) {
  const target = new EventTarget();
  const attrs = new Map();
  const children = [];
  let text = '';
  const el = {
    tagName: tagName.toUpperCase(),
    ownerDocument: doc,
    children,
    childNodes: children,
    className: '',
    classList: createClassList(),
    dataset: {},
    disabled: false,
    hidden: false,
    src: '',
    type: '',
    step: '',
    _value: '',
    _selectedIndex: -1,
    parentElement: null,
    get textContent() {
      if (children.length && !text) {
        return children.map((c) => c.textContent ?? '').join('');
      }
      return text;
    },
    set textContent(next) {
      text = String(next ?? '');
      children.length = 0;
    },
    get value() {
      if (el.tagName === 'SELECT') {
        const selected = children[el._selectedIndex];
        return selected ? selected.value : el._value;
      }
      return el._value;
    },
    set value(next) {
      const str = String(next ?? '');
      el._value = str;
      if (el.tagName === 'SELECT') {
        const idx = children.findIndex((c) => c.value === str);
        el._selectedIndex = idx;
      }
    },
    get selectedIndex() {
      return el._selectedIndex;
    },
    set selectedIndex(idx) {
      el._selectedIndex = Number(idx);
      const opt = children[el._selectedIndex];
      el._value = opt ? opt.value : '';
    },
    get options() {
      return children;
    },
    setAttribute(name, val) {
      attrs.set(name, String(val));
      if (name === 'data-cal-field') el.dataset.calField = String(val);
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
    removeAttribute(name) {
      attrs.delete(name);
      if (name === 'src') el.src = '';
    },
    appendChild(node) {
      if (node?.isFragment) {
        for (const child of node.children) {
          child.parentElement = el;
          children.push(child);
        }
        return node;
      }
      node.parentElement = el;
      children.push(node);
      return node;
    },
    replaceChildren(...nodes) {
      children.length = 0;
      text = '';
      for (const node of nodes) el.appendChild(node);
    },
    querySelector(selector) {
      const cls = selector.startsWith('.') ? selector.slice(1) : null;
      const tag = cls ? null : selector.toUpperCase();
      for (const child of children) {
        if (
          (cls &&
            typeof child.className === 'string' &&
            child.className.split(/\s+/).includes(cls)) ||
          (tag && child.tagName === tag)
        ) {
          return child;
        }
      }
      return null;
    },
    querySelectorAll(selector) {
      const cls = selector.startsWith('.') ? selector.slice(1) : null;
      const tag = cls ? null : selector.toUpperCase();
      return children.filter(
        (child) =>
          (cls &&
            typeof child.className === 'string' &&
            child.className.split(/\s+/).includes(cls)) ||
          (tag && child.tagName === tag),
      );
    },
    closest(selector) {
      const cls = selector.startsWith('.') ? selector.slice(1) : null;
      if (
        cls &&
        typeof el.className === 'string' &&
        el.className.split(/\s+/).includes(cls)
      ) {
        return el;
      }
      return el.parentElement?.closest?.(selector) || null;
    },
    focus() {},
    select() {},
    getContext() {
      return {
        clearRect() {},
        drawImage() {},
      };
    },
    addEventListener(type, fn, opts) {
      target.addEventListener(type, fn, opts);
    },
    removeEventListener(type, fn, opts) {
      target.removeEventListener(type, fn, opts);
    },
    dispatchEvent(event) {
      if (!event.target) {
        Object.defineProperty(event, 'target', {
          value: el,
          configurable: true,
        });
      }
      const res = target.dispatchEvent(event);
      if (event.bubbles && !event.cancelBubble && el.parentElement) {
        el.parentElement.dispatchEvent(event);
      }
      return res;
    },
  };
  return el;
}

function createFakeDocument() {
  const listeners = new EventTarget();
  const doc = {
    hidden: false,
    activeElement: null,
    createElement(tag) {
      return createFakeElement(tag, doc);
    },
    createTextNode(text) {
      return { textContent: String(text ?? '') };
    },
    createDocumentFragment() {
      return { isFragment: true, children: [], appendChild(n) { this.children.push(n); } };
    },
    addEventListener(type, fn, opts) {
      listeners.addEventListener(type, fn, opts);
    },
    removeEventListener(type, fn, opts) {
      listeners.removeEventListener(type, fn, opts);
    },
  };
  return doc;
}

function createFixture(t) {
  const prevDoc = globalThis.document;
  const prevWindow = globalThis.window;
  const prevImage = globalThis.Image;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCancelRaf = globalThis.cancelAnimationFrame;

  const doc = createFakeDocument();
  const imageRequests = [];
  globalThis.document = doc;
  globalThis.window = {
    setTimeout,
    clearTimeout,
  };
  globalThis.Image = class {
    constructor() {
      imageRequests.push(this);
    }
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};

  t.after(() => {
    globalThis.document = prevDoc;
    globalThis.window = prevWindow;
    globalThis.Image = prevImage;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCancelRaf;
  });

  const make = (tag = 'div') => createFakeElement(tag, doc);
  const calReadout = make('div');
  for (const [field, label] of [
    ['heading', 'HDG --'],
    ['pitch', 'PITCH --'],
    ['fov', 'FOV --'],
    ['range', 'RANGE --'],
    ['height', 'HGT --'],
    ['north', 'ΔN --'],
    ['east', 'ΔE --'],
  ]) {
    const chip = make('button');
    chip.className = 'cctv-cal-value';
    chip.setAttribute('data-cal-field', field);
    chip.textContent = label;
    calReadout.appendChild(chip);
  }

  const elements = {
    _cctvPanel: make('div'),
    _cctvEnableBtn: make('button'),
    _cctvNearestBtn: make('button'),
    _cctvPrevBtn: make('button'),
    _cctvNextBtn: make('button'),
    _cctvSelect: make('select'),
    _cctvFocusBtn: make('button'),
    _cctvCoverageBtn: make('button'),
    _cctvAutoHopBtn: make('button'),
    _cctvProjectionBtn: make('button'),
    _cctvQualityChip: make('span'),
    _cctvAdjustBtn: make('button'),
    _cctvCalReadout: calReadout,
    _cctvCalibSaveBtn: make('button'),
    _cctvCalibResetBtn: make('button'),
    _cctvFrame: make('img'),
    _cctvFrameWrap: make('div'),
    _cctvVideo: make('canvas'),
    _cctvSourceBadge: make('div'),
    _cctvMeta: make('div'),
    _cctvSummary: make('div'),
    _cctvSyncChip: make('div'),
    _cctvSyncLabel: make('span'),
    _cctvSyncProgress: make('span'),
  };
  elements._cctvVideo.hidden = true;

  const pinia = createPinia();
  const store = useCctvStore(pinia);
  const statusStore = useStatusStore(pinia);

  let enabled = false;
  const setParamsCalls = [];
  const collapsedCalls = [];
  const controls = new CctvControls({
    elements,
    store,
    statusStore,
    cctv: {
      getActiveVideoElement: () => null,
    },
    actions: {
      isEnabled: () => enabled,
      setParams: (params, opts) => setParamsCalls.push({ params, opts }),
      toggleEnabled: async (force) => {
        enabled = typeof force === 'boolean' ? force : !enabled;
        return true;
      },
      runExplicitFocus() {},
      setPanelCollapsed: (id, collapsed, opts) =>
        collapsedCalls.push({ id, collapsed, opts }),
      showToast() {},
      syncViewport() {},
    },
  });

  t.after(() => controls.destroy());
  return {
    elements,
    controls,
    store,
    statusStore,
    imageRequests,
    setParamsCalls,
    collapsedCalls,
    setEnabled: (v) => {
      enabled = v;
    },
  };
}

test('static HTML templates contain every CCTV panel and sync chip element ID', () => {
  const layerPanels = readFileSync(
    new URL('./templates/layer-panels.html', import.meta.url),
    'utf8',
  );
  const sceneChrome = readFileSync(
    new URL('./templates/scene-chrome.html', import.meta.url),
    'utf8',
  );
  for (const id of [
    'cctv-panel',
    'cctv-frame-wrap',
    'cctv-frame',
    'cctv-video',
    'cctv-source-badge',
    'cctv-meta',
    'cctv-enable-btn',
    'cctv-nearest-btn',
    'cctv-prev-btn',
    'cctv-next-btn',
    'cctv-camera-select',
    'cctv-focus-btn',
    'cctv-coverage-btn',
    'cctv-auto-hop-btn',
    'cctv-projection-btn',
    'cctv-quality-chip',
    'cctv-adjust-btn',
    'cctv-cal-readout',
    'cctv-calib-save-btn',
    'cctv-calib-reset-btn',
    'cctv-summary',
  ]) {
    assert.ok(layerPanels.includes(`id="${id}"`), `Missing #${id} in layer-panels.html`);
  }
  for (const id of ['cctv-sync-chip', 'cctv-sync-label', 'cctv-sync-progress']) {
    assert.ok(sceneChrome.includes(`id="${id}"`), `Missing #${id} in scene-chrome.html`);
  }
});

test('CctvControls syncs Pinia state into static DOM elements for snapshots, picker, calibration, video, and sync chip', () => {
  const f = createFixture(test);
  const { elements, controls, imageRequests, setParamsCalls, collapsedCalls } =
    f;

  assert.equal(elements._cctvEnableBtn.textContent, 'CCTV OFF');
  assert.equal(elements._cctvEnableBtn.classList.contains('active'), false);
  assert.equal(elements._cctvNearestBtn.disabled, true);
  assert.equal(elements._cctvSelect.disabled, true);
  assert.equal(elements._cctvSourceBadge.textContent, 'SOURCE · UNKNOWN');
  assert.equal(elements._cctvSourceBadge.dataset.frameState, 'idle');

  f.setEnabled(true);
  const cam1 = {
    id: 'aus-354',
    name: 'Congress Ave',
    city: 'Austin',
    provider: 'Austin Mobility',
    sourceKind: 'snapshot',
    sourceStatus: 'ok',
    headingDeg: 135,
    pitchDeg: -17,
    fovDeg: 74,
    rangeM: 700,
    mountHeightM: 24,
    calBadge: 'raw-prior',
    calDirty: false,
    calibration: { offsetNorthM: 0, offsetEastM: 0 },
    basePose: {
      headingDeg: 135,
      pitchDeg: -17,
      fovDeg: 74,
      rangeM: 700,
      mountHeightM: 24,
    },
    frameUrl: '/api/cctv/frame?id=aus-354',
    isVideo: false,
  };

  controls._renderCctvState({
    enabled: true,
    count: 3,
    cameraIndex: [cam1],
    activeCameraId: cam1.id,
    activeCamera: cam1,
    coverageMode: 'on',
    autoHop: true,
    showProjection: true,
    loading: { active: true, loaded: 1, total: 3 },
    summary: 'AUSTIN CCTV · CONGRESS AVE',
  });

  assert.equal(collapsedCalls[0]?.id, 'cctv-panel');
  assert.equal(collapsedCalls[0]?.collapsed, false);

  assert.equal(elements._cctvEnableBtn.textContent, 'CCTV ON');
  assert.equal(elements._cctvEnableBtn.classList.contains('active'), true);
  assert.equal(elements._cctvNearestBtn.disabled, false);
  assert.equal(elements._cctvCoverageBtn.textContent, 'COVERAGE ON');
  assert.equal(elements._cctvCoverageBtn.classList.contains('active'), true);
  assert.equal(elements._cctvAutoHopBtn.textContent, 'AUTO HOP ON');
  assert.equal(elements._cctvQualityChip.textContent, 'CAL · RAW PRIOR');
  assert.equal(elements._cctvQualityChip.dataset.calBadge, 'raw-prior');

  assert.equal(elements._cctvSelect.disabled, false);
  assert.equal(elements._cctvSelect.options.length, 2);
  assert.equal(elements._cctvSelect.options[0].value, 'aus-354');
  assert.equal(elements._cctvSelect.options[0].textContent, 'Austin · Congress Ave');
  assert.equal(elements._cctvSelect.options[1].disabled, true);
  assert.equal(elements._cctvSelect.value, 'aus-354');

  assert.equal(elements._cctvFrameWrap.classList.contains('loading'), true);
  assert.equal(elements._cctvSourceBadge.textContent, 'FRAME · LOADING');
  assert.equal(elements._cctvSourceBadge.dataset.frameState, 'loading');

  assert.equal(imageRequests.length, 1);
  imageRequests[0].onload();

  assert.equal(elements._cctvFrameWrap.classList.contains('loading'), false);
  assert.equal(elements._cctvFrameWrap.classList.contains('has-frame'), true);
  assert.equal(elements._cctvFrame.src, '/api/cctv/frame?id=aus-354');
  assert.equal(elements._cctvFrame.classList.contains('active'), true);
  assert.equal(elements._cctvFrame.hidden, false);
  assert.equal(elements._cctvVideo.hidden, true);
  assert.equal(elements._cctvSourceBadge.textContent, 'SNAPSHOT · OK');
  assert.equal(elements._cctvSourceBadge.dataset.frameState, 'ready');

  assert.equal(elements._cctvSyncChip.classList.contains('visible'), true);
  assert.equal(elements._cctvSyncLabel.textContent, 'loading frames');
  assert.equal(elements._cctvSyncProgress.textContent, '1/3');

  const hdgChip = elements._cctvCalReadout.querySelectorAll('.cctv-cal-value')[0];
  assert.equal(hdgChip.textContent.startsWith('HDG '), true);
  hdgChip.dispatchEvent(new Event('click', { bubbles: true }));
  const input = hdgChip.querySelector('.cctv-cal-input');
  assert.ok(input, 'clicking calibration chip should open inline number input');
  input.value = '180';
  const keyEvent = new Event('keydown', { cancelable: true });
  keyEvent.key = 'Enter';
  input.dispatchEvent(keyEvent);
  assert.equal(setParamsCalls.length, 1);
  assert.deepEqual(setParamsCalls[0].params.calibration, {
    cameraId: 'aus-354',
    patch: { headingDeg: 45 },
  });
  assert.equal(hdgChip.querySelector('.cctv-cal-input'), null);

  controls._renderCctvState({
    enabled: true,
    count: 1,
    cameraIndex: [cam1],
    activeCameraId: cam1.id,
    activeCamera: { ...cam1, feedType: 'hls', isVideo: true },
    loading: { active: false, loaded: 1, total: 1 },
  });
  assert.equal(elements._cctvFrame.hidden, true);
  assert.equal(elements._cctvVideo.hidden, false);
});

test('getPublicCameraState computes isVideo from camera feedType', () => {
  const layerState = {
    _records: [],
    _healthById: new Map(),
    _coverageMode: 'off',
    _showProjection: true,
    _calibrationMode: false,
    _autoHop: false,
    _autoHopSuspended: false,
    _autoHopSec: 12,
    _count: 0,
    _lastUpdate: null,
    _lastError: null,
    _geoLoading: false,
    _geoLoadDone: 0,
    _geoLoadTotal: 0,
    _cardIds: new Set(),
    _cardFetchCount: 0,
    _cardMinFetchSpacingMs: null,
    _cardFetchMode: 'steady',
    _cardFetchInFlightCount: 0,
    _hoverCardId: null,
    _listeners: new Set(),
    _lastTransientNotifyAt: 0,
  };
  const parts = {
    calibration: {
      normalizeCalibration: (c) => c || {},
      deriveCalBadge: () => 'raw-prior',
    },
    frames: {
      frameUrlFor: () => '/api/cctv/frame?id=1',
      mediaUrlFor: () => '/api/cctv/media?id=1',
    },
    selection: {
      getActiveRecord: () => null,
    },
    geometry: {
      coverageNeighborCount: () => 0,
    },
  };
  parts.model = createModel({
    state: layerState,
    services: { focus: { focusPassIsNeeded: () => false, getFocusTarget: () => null } },
    parts,
    source: {},
  });
  const presentation = createPresentation({
    state: layerState,
    services: {},
    parts,
    source: {},
  });

  const hlsState = presentation.getPublicCameraState({
    camera: {
      id: 'cam-hls',
      name: 'Stream',
      city: 'Austin',
      provider: 'Test',
      feedType: 'hls',
      lat: 30,
      lon: -97,
      headingDeg: 0,
      pitchDeg: -10,
      fovDeg: 70,
      rangeM: 500,
      mountHeightM: 20,
      absoluteHeightM: 20,
    },
  });
  assert.equal(hlsState.isVideo, true);

  const imgState = presentation.getPublicCameraState({
    camera: {
      id: 'cam-img',
      name: 'Still',
      city: 'Austin',
      provider: 'Test',
      feedType: 'image',
      lat: 30,
      lon: -97,
      headingDeg: 0,
      pitchDeg: -10,
      fovDeg: 70,
      rangeM: 500,
      mountHeightM: 20,
      absoluteHeightM: 20,
    },
  });
  assert.equal(imgState.isVideo, false);
});
