/**
 * Weather Effects Math Utilities
 */

export function deriveWeatherEffectProfile(weather) {
  if (!weather) return { available: false, cloud: 0, windDirectionDeg: 0, wind: 0 };
  const cloud = typeof weather.cloudCover === 'number' ? weather.cloudCover / 100 : 0.5;
  const wind = typeof weather.windSpeed === 'number' ? Math.min(1, weather.windSpeed / 50) : 0.2;
  const windDirectionDeg = weather.windDirection ?? 0;
  return {
    available: true,
    cloud,
    windDirectionDeg,
    wind,
  };
}

export function weatherAltitudeFactors(altitudeM = 1000) {
  const alt = Math.max(0, Number(altitudeM) || 0);
  const cloud = alt < 200 ? 0.2 : alt < 8000 ? 1.0 : Math.max(0, 1 - (alt - 8000) / 12000);
  return {
    cloud,
  };
}
