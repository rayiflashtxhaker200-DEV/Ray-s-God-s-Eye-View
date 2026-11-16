/**
 * Manages microphone mute state, push-to-talk Space shortcut, and voice visualizers.
 */
export class RealtimeInput {
  constructor({
    readUi = () => null,
    readStream = () => null,
    readStatus = () => 'idle',
    operations = {},
  } = {}) {
    this.readUi = readUi;
    this.readStream = readStream;
    this.readStatus = readStatus;
    this.operations = operations;
    this.pushToTalkMode = false;
    this.pushToTalkKeyHeld = false;
    this.spaceKeyHeld = false;
    this._shortcutBound = false;
    this._onKeyDown = null;
    this._onKeyUp = null;
  }

  setMicrophoneEnabled(enabled) {
    const stream = this.readStream?.();
    if (stream?.getAudioTracks) {
      for (const track of stream.getAudioTracks()) {
        track.enabled = Boolean(enabled);
      }
    }
    this.readUi()?.update?.('root', { microphone: Boolean(enabled) });
    this.updateVoiceButtonLabel();
  }

  updateVoiceButtonLabel() {
    const ui = this.readUi?.();
    if (!ui?.update) return;
    ui.update('root', {
      status: this.readStatus?.() || 'idle',
      pushToTalk: Boolean(this.pushToTalkMode),
    });
  }

  setVoiceSpeaker(speaker = 'idle') {
    this.readUi?.()?.update?.('root', { speaker });
  }

  startVoiceVisualizer() {
    /* Optional analyser hook for dock bars */
  }

  stopVoiceVisualizer() {
    this.readUi?.()?.setBars?.(null);
  }

  startAssistantVoiceVisualizer() {
    /* Optional assistant output visualizer hook */
  }

  cancelPushToTalkHold() {
    this.pushToTalkKeyHeld = false;
    this.spaceKeyHeld = false;
    this.operations.releasePointerHold?.();
  }

  resetSession() {
    this.cancelPushToTalkHold();
    this.setVoiceSpeaker('idle');
    this.stopVoiceVisualizer();
  }

  bindPushToTalkShortcut() {
    if (this._shortcutBound || typeof globalThis.window?.addEventListener !== 'function')
      return;
    this._shortcutBound = true;
    this._onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const tag = event.target?.tagName?.toLowerCase?.();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable)
        return;
      if (!this.operations.isActive?.()) return;
      this.spaceKeyHeld = true;
      if (this.pushToTalkMode) {
        this.pushToTalkKeyHeld = true;
        this.operations.holdPointer?.();
        this.operations.bargeIn?.();
        this.setMicrophoneEnabled(true);
      }
    };
    this._onKeyUp = (event) => {
      if (event.code !== 'Space') return;
      this.spaceKeyHeld = false;
      if (this.pushToTalkMode && this.pushToTalkKeyHeld) {
        this.pushToTalkKeyHeld = false;
        this.setMicrophoneEnabled(false);
        this.operations.releasePointerHold?.();
      }
    };
    globalThis.window.addEventListener('keydown', this._onKeyDown);
    globalThis.window.addEventListener('keyup', this._onKeyUp);
  }

  detachBindings() {
    if (!this._shortcutBound) return;
    this._shortcutBound = false;
    if (typeof globalThis.window?.removeEventListener === 'function') {
      if (this._onKeyDown) globalThis.window.removeEventListener('keydown', this._onKeyDown);
      if (this._onKeyUp) globalThis.window.removeEventListener('keyup', this._onKeyUp);
    }
    this._onKeyDown = null;
    this._onKeyUp = null;
  }
}
