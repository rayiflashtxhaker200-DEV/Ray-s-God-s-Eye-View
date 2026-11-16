/**
 * Coordinates Radio audio playback ducking, voice speaker handoffs, and tool reservations.
 */
export class RealtimeRadio {
  constructor({
    readRadioLayer = () => null,
    readDataManager = () => null,
    readChannel = () => null,
    readUserTurnPending = () => false,
    readSessionId = () => '',
    operations = {},
  } = {}) {
    this.readRadioLayer = readRadioLayer;
    this.readDataManager = readDataManager;
    this.readChannel = readChannel;
    this.readUserTurnPending = readUserTurnPending;
    this.readSessionId = readSessionId;
    this.operations = operations;
    this.pendingRadioPlaybackResult = null;
    this.radioHandoffInFlightResult = null;
    this.radioHandoffEpoch = 0;
    this._tools = new Map();
    this._unsubscribe = null;
  }

  observe() {
    this.detachObservers();
    const radio = this.readRadioLayer?.();
    if (typeof radio?.subscribe === 'function') {
      this._unsubscribe = radio.subscribe(() => {});
    }
  }

  detachObservers() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  isActive() {
    return Boolean(this.operations.isActive?.());
  }

  pauseRadioForVoice() {
    this.setRadioVoiceDucking(true);
  }

  mayVoiceClaimSpeaker() {
    return true;
  }

  cancelRadioHandoff() {
    this.radioHandoffEpoch++;
    this.pendingRadioPlaybackResult = null;
    this.radioHandoffInFlightResult = null;
  }

  reserveRadioToolHandoff({ abortScope = 'playback' } = {}) {
    this.radioHandoffEpoch++;
    return {
      epoch: this.radioHandoffEpoch,
      abortScope,
    };
  }

  registerTool(action, metadata = {}) {
    if (action) this._tools.set(action, metadata);
  }

  releaseTool(action) {
    this._tools.delete(action);
  }

  setPendingPlayback(result) {
    this.pendingRadioPlaybackResult = result || null;
  }

  settleRadioToolHandoffReservation(reservation, { commit = false } = {}) {
    if (!reservation) return;
    if (!commit) {
      this.pendingRadioPlaybackResult = null;
    }
  }

  cancelPlaybackResult(result) {
    if (this.pendingRadioPlaybackResult === result) {
      this.pendingRadioPlaybackResult = null;
    }
    if (this.radioHandoffInFlightResult === result) {
      this.radioHandoffInFlightResult = null;
    }
  }

  async startPendingRadioHandoff() {
    const result = this.pendingRadioPlaybackResult;
    this.pendingRadioPlaybackResult = null;
    if (!result) return false;
    this.radioHandoffInFlightResult = result;
    try {
      const radio = this.readRadioLayer?.();
      await radio?.resume?.();
      return true;
    } finally {
      if (this.radioHandoffInFlightResult === result) {
        this.radioHandoffInFlightResult = null;
      }
    }
  }

  clearTools() {
    this._tools.clear();
  }

  invalidateHandoff() {
    this.radioHandoffEpoch++;
  }

  stopHandoff({ preserveRadioPlayback = false } = {}) {
    this.radioHandoffInFlightResult = null;
    if (!preserveRadioPlayback) {
      this.setRadioVoiceDucking(false);
    }
  }

  clearPendingPlayback() {
    this.pendingRadioPlaybackResult = null;
  }

  setRadioVoiceDucking(ducked) {
    this.readRadioLayer?.()?.setVoiceDucked?.(Boolean(ducked));
  }
}
