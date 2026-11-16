import * as Cesium from 'cesium';

export const GEO_FILE_ACCEPT = '.geojson,.json,.kml,.kmz';
export const MAX_IMPORTED_FILES = 12;

export class GeoImportError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GeoImportError';
    this.code = code;
  }
}

export async function loadGeoFile(file, { viewer, color = '#39d0ff' } = {}) {
  if (!file || !viewer?.dataSources) {
    throw new GeoImportError('INVALID_INPUT', 'A file and viewer are required');
  }
  const name = String(file.name || 'import');
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!['geojson', 'json', 'kml', 'kmz'].includes(ext)) {
    throw new GeoImportError('UNSUPPORTED_FORMAT', `Unsupported file format: ${ext}`);
  }
  let dataSource;
  let ownStyles = false;
  if (ext === 'kml' || ext === 'kmz') {
    ownStyles = true;
    dataSource = await Cesium.KmlDataSource.load(file, {
      camera: viewer.scene?.camera,
      canvas: viewer.scene?.canvas,
      clampToGround: true,
    });
  } else {
    const text = await file.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new GeoImportError('INVALID_JSON', 'Invalid GeoJSON file');
    }
    const cssColor = Cesium.Color.fromCssColorString(color);
    dataSource = await Cesium.GeoJsonDataSource.load(json, {
      stroke: cssColor,
      fill: cssColor.withAlpha(0.25),
      markerColor: cssColor,
      clampToGround: true,
    });
  }
  await viewer.dataSources.add(dataSource);
  viewer.scene?.requestRender?.();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    format: ext === 'json' ? 'geojson' : ext,
    entityCount: dataSource.entities?.values?.length ?? 0,
    ownStyles,
    visible: true,
    color,
    dataSource,
    setVisible(next) {
      dataSource.show = Boolean(next);
      this.visible = Boolean(next);
      viewer.scene?.requestRender?.();
    },
    async refreshGround() {},
    destroy() {
      viewer.dataSources?.remove?.(dataSource, true);
      viewer.scene?.requestRender?.();
    },
  };
}
