/**
 * Voice Models and Cost Accounting
 */

export const VOICE_MODELS = {
  standard: { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime' },
  mini: { id: 'gpt-4o-mini-realtime-preview', name: 'GPT-4o Mini Realtime' },
  'gpt-4o-realtime-preview': { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime' },
  'gemini-2.5-flash': { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
};

export function resolveVoiceModel(tier) {
  return {
    tier: tier || 'mini',
    model: 'gpt-4o-realtime-preview',
  };
}

export function isKnownVoiceTier(tier) {
  return ['mini', 'standard', 'advanced'].includes(String(tier).toLowerCase());
}

