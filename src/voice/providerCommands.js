/**
 * Compose provider-switchable voice commands over OpenAI Realtime and Gemini Live factories.
 */
export function createProviderCommands(
  options = {},
  { bind, factories = {} } = {},
) {
  const supported = (
    Array.isArray(options.supportedProviders) &&
    options.supportedProviders.length
      ? options.supportedProviders
      : Object.keys(factories)
  ).filter((id) => typeof factories[id] === 'function');
  const initialProvider =
    options.provider && factories[options.provider]
      ? options.provider
      : supported.includes('gemini')
        ? 'gemini'
        : supported[0] || 'gemini';

  return bind({
    ...options,
    supportedProviders: supported,
    initialProvider,
    providerFactories: factories,
    createSession:
      factories[initialProvider] ||
      factories.gemini ||
      factories.openai ||
      Object.values(factories)[0],
  });
}
