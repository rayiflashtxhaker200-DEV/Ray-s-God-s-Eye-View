export const VOICE_MODELS = {
  standard: {
    id: 'gpt-4o-realtime-preview',
    name: 'Standard',
  },
  mini: {
    id: 'gpt-4o-mini-realtime-preview',
    name: 'Mini',
  },
};

export function isKnownVoiceTier(tier) {
  return Boolean(tier && VOICE_MODELS[tier]);
}

export function resolveVoiceModel(tier) {
  return VOICE_MODELS[tier]?.id || VOICE_MODELS.standard.id;
}
