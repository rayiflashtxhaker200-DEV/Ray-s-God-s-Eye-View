/**
 * Hybrid Night Map & Activatable Color Filter Shaders.
 *
 * 1. `NIGHT_TILESET_FRAGMENT_SHADER` + `createNightTilesetCustomShader`:
 *    Native `Cesium.CustomShader` (`LightingModel.UNLIT`) attached directly to
 *    Google Photorealistic 3D Tiles and OSM 3D Buildings. Preserves original
 *    material hues at balanced nocturnal exposure (0.38) with a 0.14 shadow floor
 *    and softly illuminates naturally bright architectural details (windows,
 *    signage, highlights) without edge artifacts or photogrammetry normal blotches.
 *
 * 2. `NIGHT_COLOR_FILTER_SHADER` (also exported as `NIGHT_MAP_SHADER`):
 *    Edge-free, depth-ring-free 1-tap `Cesium.PostProcessStage` implementing the
 *    activatable Ray's Eye View tactical color filter (soft emerald shadow
 *    split-toning + warm amber lit accents while preserving original hues).
 */

export const NIGHT_TILESET_FRAGMENT_SHADER = /* glsl */ `
  void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    vec3 origColor = max(material.diffuse, vec3(0.0));
    float luma = dot(origColor, vec3(0.2126, 0.7152, 0.0722));

    // Preserve original surface hues (patina, foliage, water, brick) at balanced night exposure
    vec3 nightBase = origColor * u_nightExposure;
    nightBase = max(nightBase, origColor * u_shadowFloor);

    // Subtle cool moonlight balance without washing out original saturation
    vec3 moonBalanced = mix(nightBase, nightBase * vec3(0.90, 0.95, 1.06), 0.30);

    // Soft urban window & facade highlight illumination from natural texture brightness
    float lightMask = smoothstep(u_windowThreshold, 0.98, luma);
    vec3 warmLight = mix(origColor, vec3(1.0, 0.88, 0.68), 0.45);
    vec3 nightColor = moonBalanced + (warmLight * lightMask * u_windowGlow);

    material.diffuse = clamp(mix(origColor, nightColor, clamp(u_nightIntensity, 0.0, 1.0)), 0.0, 1.0);
  }
`;

export function createNightTilesetCustomShader(CesiumRef) {
  if (typeof CesiumRef?.CustomShader !== 'function') return null;
  const lightingModel = CesiumRef.LightingModel?.UNLIT ?? 0;
  const floatType = CesiumRef.UniformType?.FLOAT ?? 'float';
  return new CesiumRef.CustomShader({
    lightingModel,
    uniforms: {
      u_nightIntensity: {
        type: floatType,
        value: 0.0,
      },
      u_nightExposure: {
        type: floatType,
        value: 0.38,
      },
      u_shadowFloor: {
        type: floatType,
        value: 0.14,
      },
      u_windowThreshold: {
        type: floatType,
        value: 0.80,
      },
      u_windowGlow: {
        type: floatType,
        value: 0.52,
      },
    },
    fragmentShaderText: NIGHT_TILESET_FRAGMENT_SHADER,
  });
}

export const NIGHT_COLOR_FILTER_SHADER = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform float colorFilterIntensity;
  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;
    vec4 original = texture(colorTexture, uv);
    vec3 rgb = max(original.rgb, vec3(0.0));
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));

    // Soft emerald shadow split-toning (ignores pitch-black empty sky pixels)
    float shadowMask = (1.0 - smoothstep(0.02, 0.46, luma)) * smoothstep(0.006, 0.045, luma);
    vec3 emeraldShadow = vec3(0.018, 0.095, 0.082) * shadowMask;

    // Gentle emerald clarity on midtones while keeping underlying material hues intact
    vec3 subtleMid = rgb * vec3(0.90, 1.06, 0.96);

    // Warm copper-amber accent on illuminated city highlights
    float highlightMask = smoothstep(0.48, 0.92, luma);
    vec3 amberHighlight = mix(rgb, vec3(1.0, 0.74, 0.42), 0.32) * highlightMask * 0.24;

    vec3 graded = mix(rgb, subtleMid, 0.55) + emeraldShadow * 0.70 + amberHighlight;
    vec3 finalRgb = mix(rgb, clamp(graded, 0.0, 1.0), clamp(colorFilterIntensity, 0.0, 1.0));
    out_FragColor = vec4(finalRgb, original.a);
  }
`;

export const NIGHT_MAP_SHADER = NIGHT_COLOR_FILTER_SHADER;
