/**
 * Protocol helpers shared by Gemini Live and OpenAI Realtime sessions.
 */

export function hasStructuredViewIdentity(result) {
  return Boolean(
    result?.scene?.viewIdentity ||
      result?.viewIdentity ||
      result?.target?.label,
  );
}

export function shouldSendViewportImage(viewScale) {
  if (!viewScale) return false;
  const normalized = String(viewScale).trim().toLowerCase();
  return !['global', 'globe', 'planet', 'space'].includes(normalized);
}

export function shouldStopVoiceAfterRadioTool(result) {
  if (!result?.ok || !result?.radioAction) return false;
  return ['play', 'enable', 'tune'].includes(String(result.radioAction).toLowerCase());
}

export function responseInstructionForToolResult(result) {
  if (!result || result.ok === false) {
    return result?.error
      ? `Report clearly that the action failed: ${result.error}`
      : 'Report clearly that the command could not be completed.';
  }
  if (result.say) {
    return `Answer briefly using this result summary: ${result.say}`;
  }
  return 'Answer briefly confirming the map or data update.';
}

export function isGlobeViewRefusal(result) {
  return Boolean(
    result &&
      result.ok === false &&
      (result.code === 'GLOBE_VIEW_REFUSED' ||
        result.reason === 'globe-view-refused'),
  );
}
