import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFramePauseControls,
  isFramesPausedForViewer,
} from './framePauseControls.js';

function fakeButton() {
  const listeners = new Map();
  const attrs = new Map();
  const classes = new Set();
  const icon = { textContent: 'pause' };
  return {
    attrs,
    classes,
    icon,
    classList: {
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        } else if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    setAttribute(name, val) {
      attrs.set(name, String(val));
    },
    querySelector(selector) {
      return selector === '.material-symbols-outlined' ? icon : null;
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    click() {
      listeners.get('click')?.();
    },
  };
}

function fakeDocument() {
  const bodyClasses = new Set();
  return {
    hidden: false,
    body: {
      classList: {
        add(name) {
          bodyClasses.add(name);
        },
        remove(name) {
          bodyClasses.delete(name);
        },
        has(name) {
          return bodyClasses.has(name);
        },
      },
    },
    bodyClasses,
  };
}

test('createFramePauseControls pauses and resumes Cesium render loop, clock, effects, and button UI', () => {
  const viewer = {
    useDefaultRenderLoop: true,
    clock: { shouldAnimate: true },
    scene: {
      renderCalls: 0,
      requestRender() {
        this.renderCalls += 1;
      },
    },
  };
  const button = fakeButton();
  const doc = fakeDocument();
  const effectStates = [];
  const cloudStates = [];
  const governorCalls = [];
  const toasts = [];
  let hidden = false;

  const controls = createFramePauseControls({
    viewer,
    button,
    visualEffects: {
      setPaused(p) {
        effectStates.push(p);
      },
    },
    cockpitCloudEffects: {
      setSuspended(s) {
        cloudStates.push(s);
      },
    },
    requestRender: (reason) => governorCalls.push(reason),
    isHidden: () => hidden,
    showToast: (msg) => toasts.push(msg),
    documentRef: doc,
  });

  assert.equal(isFramesPausedForViewer(viewer), false);
  assert.equal(button.icon.textContent, 'pause');
  assert.equal(button.attrs.get('aria-pressed'), 'false');

  button.click();
  assert.equal(controls.isPaused(), true);
  assert.equal(isFramesPausedForViewer(viewer), true);
  assert.equal(viewer.useDefaultRenderLoop, false);
  assert.equal(viewer.clock.shouldAnimate, false);
  assert.deepEqual(effectStates, [true]);
  assert.deepEqual(cloudStates, [true]);
  assert.equal(doc.bodyClasses.has('frames-paused'), true);
  assert.equal(button.icon.textContent, 'play_arrow');
  assert.equal(button.attrs.get('aria-pressed'), 'true');
  assert.equal(toasts.length, 1);

  button.click();
  assert.equal(controls.isPaused(), false);
  assert.equal(isFramesPausedForViewer(viewer), false);
  assert.equal(viewer.useDefaultRenderLoop, true);
  assert.equal(viewer.clock.shouldAnimate, true);
  assert.deepEqual(effectStates, [true, false]);
  assert.deepEqual(cloudStates, [true, false]);
  assert.equal(doc.bodyClasses.has('frames-paused'), false);
  assert.equal(button.icon.textContent, 'pause');
  assert.equal(button.attrs.get('aria-pressed'), 'false');
  assert.deepEqual(governorCalls, ['frames-resume']);
  assert.equal(viewer.scene.renderCalls, 1);
  assert.equal(toasts.length, 2);

  // Late-attached cloud effects immediately adopt current paused state
  controls.setPaused(true, { silent: true });
  const lateCloud = [];
  controls.attachCloudEffects({
    setSuspended(s) {
      lateCloud.push(s);
    },
  });
  assert.deepEqual(lateCloud, [true]);

  // If tab is hidden while unpausing via dispose, render loop stays suspended for hidden tab
  hidden = true;
  controls.dispose();
  assert.equal(isFramesPausedForViewer(viewer), false);
  assert.equal(viewer.useDefaultRenderLoop, false);
  assert.equal(viewer.clock.shouldAnimate, true);
  assert.equal(doc.bodyClasses.has('frames-paused'), false);
});
