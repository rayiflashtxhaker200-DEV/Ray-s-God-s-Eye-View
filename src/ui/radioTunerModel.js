/**
 * Radio Tuner Math & Slot Mapping Model
 */

export function radioTunerSlot(requestedSlot, count) {
  if (!count || count <= 0) {
    return {
      slot: 0,
      max: 0,
      locked: false,
      stationIndex: -1,
      leftIndex: -1,
      rightIndex: -1,
    };
  }
  const max = Math.max(0, count - 1);
  const slot = Math.max(0, Math.min(requestedSlot, max));
  return {
    slot,
    max,
    locked: true,
    stationIndex: slot,
    leftIndex: slot,
    rightIndex: slot,
  };
}

export function radioTunerPointerPosition(clientX, trackLeft, trackWidth, count) {
  if (!count || count <= 0) {
    return { ratio: 0, coordinate: 0, stationIndex: -1 };
  }
  const padding = 7;
  const usableWidth = Math.max(1, trackWidth - padding * 2);
  const offset = clientX - trackLeft - padding;
  const ratio = Math.max(0, Math.min(1, offset / usableWidth));
  const coordinate = count === 1 ? 0 : ratio * (count - 1);
  const stationIndex = Math.round(coordinate);
  return { ratio, coordinate, stationIndex };
}

export function radioTunerCommitSlot(fractionalSlot, count) {
  return radioTunerSlot(Math.round(fractionalSlot), count);
}

export function buildRadioTunerTicks(stationIndex, count, width = 300) {
  const pitchPx = 10;
  const maxIndex = Math.max(1, count - 1);
  const needleX = (stationIndex / maxIndex) * (width - 14) + 7;
  const tapeOffset = -stationIndex * pitchPx * 4;

  const ticks = [];
  const start = Math.max(0, stationIndex - 12);
  const end = Math.min(count, stationIndex + 13);
  for (let i = start; i < end; i++) {
    ticks.push({
      stationIndex: i,
      xPx: tapeOffset + i * pitchPx * 4,
    });
  }

  return {
    needleX,
    pitchPx,
    ticks,
  };
}
