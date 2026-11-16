/**
 * Numbered referent registry tracking entities/places returned by recent tool calls.
 */
export function createReferentRegistry() {
  let items = [];
  let gen = 0;

  return {
    generation() {
      return gen;
    },
    get(index) {
      const n = Number(index);
      if (!Number.isInteger(n) || n < 1 || n > items.length) return null;
      return items[n - 1] || null;
    },
    list() {
      return [...items];
    },
    recordResult(name, result, { since } = {}) {
      void name;
      if (since !== undefined && since !== gen) return false;
      const raw =
        result?.referents ||
        result?.records ||
        result?.places ||
        result?.data?.records ||
        null;
      if (!Array.isArray(raw) || raw.length === 0) return false;
      items = raw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const label =
            entry.label ||
            entry.name ||
            entry.callsign ||
            entry.title ||
            entry.id ||
            null;
          if (!label && !Number.isFinite(entry.lat)) return null;
          return {
            ...entry,
            label: label ? String(label) : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 25);
      gen++;
      return items.length > 0;
    },
    clear() {
      items = [];
      gen++;
    },
  };
}
