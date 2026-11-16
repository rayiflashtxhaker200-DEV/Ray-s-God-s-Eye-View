/**
 * Compose provider-switchable voice commands over OpenAI Realtime and Gemini Live factories.
 */
export function createProviderCommands(
  options = {},
  { bind, factories = {} } = {},
) {
  const supported =
    Array.isArray(options.supportedProviders) && options.supportedProviders.length
      ? options.supportedProviders
      : Object.keys(factories);
  const initialProvider =
    options.provider && factories[options.provider]
      ? options.provider
      : supported[0] || 'gemini';

  return bind({
    ...options,
    createSession:
      factories[initialProvider] ||
      factories.gemini ||
      factories.openai ||
      Object.values(factories)[0],
  });
}
