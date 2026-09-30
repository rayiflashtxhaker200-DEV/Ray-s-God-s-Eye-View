/**
 * Scene Controls UI
 */

export class SceneControls {
  constructor(options = {}) {
    this.options = options;
  }

  setPlaybackActive(active) {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('scene-playback-mode', active);
    }
  }

  destroy() {}
}
