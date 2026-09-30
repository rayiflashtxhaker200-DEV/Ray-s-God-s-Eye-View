import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const outputDir = path.resolve('public/assets/realismo');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const assets = [
  {
    filename: 'europa_burguesia.jpg',
    category: 'ORIGEN · EUROPA A AMÉRICA',
    title: 'Realismo Europeo',
    subtitle: 'Burguesía, Positivismo e Industrialización',
    author: 'Gustave Flaubert & Honoré de Balzac',
    works: 'Madame Bovary · La Comédie Humaine',
    year: 'Francia · Siglo XIX',
    badge: 'Cuna del Realismo',
    bg: '#0f172a',
    accent: '#38bdf8',
    secondary: '#f59e0b',
    symbol: '🏛️',
  },
  {
    filename: 'jose_hernandez.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'José Hernández',
    subtitle: 'Voz poética del gaucho y las pampas argentinas',
    author: '1834 – 1886',
    works: 'El Gaucho Martín Fierro · La Vuelta de Martín Fierro',
    year: 'Argentina',
    badge: 'Costumbrismo Gauchesco',
    bg: '#311005',
    accent: '#f59e0b',
    secondary: '#fbbf24',
    symbol: '🐎',
  },
  {
    filename: 'martin_fierro.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'El Gaucho Martín Fierro',
    subtitle: '«Aquí me pongo a cantar al compás de la vigüela...»',
    author: 'José Hernández',
    works: 'Publicado en 1872',
    year: 'Buenos Aires, Río de la Plata',
    badge: 'Obra Cumbre Gauchesca',
    bg: '#451a03',
    accent: '#fbbf24',
    secondary: '#ea580c',
    symbol: '📜',
  },
  {
    filename: 'eugenio_diaz_castro.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'Eugenio Díaz Castro',
    subtitle: 'Pionero de la novela costumbrista en Colombia',
    author: '1804 – 1865',
    works: 'Fundador de El Mosaico · Manuela',
    year: 'Bogotá, Colombia',
    badge: 'Costumbrismo Andino',
    bg: '#064e3b',
    accent: '#34d399',
    secondary: '#fcd34d',
    symbol: '✒️',
  },
  {
    filename: 'manuela.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'Manuela',
    subtitle: 'Novela de costumbres campesinas e identidad popular',
    author: 'Eugenio Díaz Castro',
    works: 'Publicado en 1858',
    year: 'Colombia · Cordillera Andina',
    badge: 'Tipos Campesinos y Tradición',
    bg: '#0f766e',
    accent: '#2dd4bf',
    secondary: '#fbbf24',
    symbol: '📖',
  },
  {
    filename: 'el_murcielago.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'El Murciélago',
    subtitle: 'Periódico satírico, crónica y pintura de costumbres',
    author: 'Manuel Atanasio Fuentes',
    works: 'Crítica mordaz de tipos urbanos y sociedad criolla',
    year: 'Lima / Región Andina',
    badge: 'Sátira Costumbrista',
    bg: '#18181b',
    accent: '#f43f5e',
    secondary: '#a1a1aa',
    symbol: '🦇',
  },
  {
    filename: 'facundo.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'Facundo',
    subtitle: 'Civilización y Barbarie: Vida de Juan Facundo Quiroga',
    author: 'Domingo Faustino Sarmiento',
    works: 'Publicado en 1845',
    year: 'Argentina / Chile',
    badge: 'Tesis de Civilización',
    bg: '#7f1d1d',
    accent: '#f87171',
    secondary: '#fbbf24',
    symbol: '⚔️',
  },
  {
    filename: 'brasil_tierra_hombre.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'El Brasil: La Tierra y el Hombre',
    subtitle: 'Geografía humana, suelo tropical y transición social',
    author: 'Realismo Brasileño',
    works: 'Estudio de la geografía, sertón y litoral',
    year: 'Brasil · Siglo XIX',
    badge: 'Análisis Territorial',
    bg: '#14532d',
    accent: '#4ade80',
    secondary: '#eab308',
    symbol: '🌴',
  },
  {
    filename: 'ferrocarril_paisaje.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XIX',
    title: 'El Ferrocarril y el Progreso',
    subtitle: 'Impacto de la técnica europea sobre la naturaleza americana',
    author: 'Grabados Históricos',
    works: 'Rieles cruzando llanuras, selvas y quebradas',
    year: 'Transformación Rural-Urbana',
    badge: 'Huella del Progreso',
    bg: '#1c1917',
    accent: '#fb923c',
    secondary: '#94a3b8',
    symbol: '🚂',
  },
  {
    filename: 'la_voragine.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XX',
    title: 'La Vorágine',
    subtitle: '«Antes que me hubiera apasionado por mujer alguna...»',
    author: 'José Eustasio Rivera',
    works: 'Publicada en 1924',
    year: 'Amazonía / Llanos de Colombia',
    badge: 'Novela de la Selva',
    bg: '#022c22',
    accent: '#10b981',
    secondary: '#f59e0b',
    symbol: '🌿',
  },
  {
    filename: 'huasipungo.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XX',
    title: 'Huasipungo',
    subtitle: 'Denuncia cruda de la servidumbre y el despojo del pueblo quechua',
    author: 'Jorge Icaza',
    works: 'Publicado en 1934',
    year: 'Quito, Ecuador · Andes',
    badge: 'Novela Indigenista',
    bg: '#7c2d12',
    accent: '#ea580c',
    secondary: '#facc15',
    symbol: '⛰️',
  },
  {
    filename: 'selva_amazonica.jpg',
    category: 'AMÉRICA DEL SUR · SIGLO XX',
    title: 'La Selva Amazónica',
    subtitle: 'La inmensidad devoradora y la fiebre cauchera',
    author: 'Naturaleza Indómita',
    works: 'Determinismo ambiental y lucha del hombre',
    year: 'Cuenca Amazónica',
    badge: 'Espacio Literario',
    bg: '#052e16',
    accent: '#22c55e',
    secondary: '#38bdf8',
    symbol: '🦜',
  },
  {
    filename: 'mapa_norteamerica.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XIX',
    title: 'Río Misisipi y Nueva Inglaterra',
    subtitle: 'Cartografía literaria: frontera, río y tradición puritana',
    author: 'Geografía Literaria',
    works: 'Del Valle del Misisipi a las mansiones de Boston',
    year: 'Estados Unidos · Siglo XIX',
    badge: 'Espacio Geográfico',
    bg: '#1e3a8a',
    accent: '#60a5fa',
    secondary: '#fbbf24',
    symbol: '🗺️',
  },
  {
    filename: 'henry_james.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XIX',
    title: 'Henry James',
    subtitle: 'Explorador magistral de la conciencia y la ambigüedad moral',
    author: '1843 – 1916',
    works: 'Otra vuelta de tuerca · Retrato de una dama',
    year: 'Nueva York / Londres',
    badge: 'Realismo Psicológico',
    bg: '#3b0764',
    accent: '#c084fc',
    secondary: '#f472b6',
    symbol: '👁️',
  },
  {
    filename: 'otra_vuelta_tuerca.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XIX',
    title: 'Otra Vuelta de Tuerca',
    subtitle: 'The Turn of the Screw: Suspenso, sugestión e introspección',
    author: 'Henry James',
    works: 'Publicado en 1898',
    year: 'Estados Unidos / Inglaterra',
    badge: 'Maestría Psicológica',
    bg: '#1e1b4b',
    accent: '#818cf8',
    secondary: '#cbd5e1',
    symbol: '🕯️',
  },
  {
    filename: 'huckleberry_finn.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XIX',
    title: 'Huckleberry Finn',
    subtitle: 'Las aventuras de Huck y Jim en la balsa del Misisipi',
    author: 'Mark Twain (Samuel Clemens)',
    works: 'Publicado en 1884',
    year: 'Río Misisipi, EE. UU.',
    badge: 'Regionalismo y Dialecto',
    bg: '#451a03',
    accent: '#f59e0b',
    secondary: '#38bdf8',
    symbol: '🛶',
  },
  {
    filename: 'john_steinbeck.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XX',
    title: 'John Steinbeck',
    subtitle: 'Cronista y defensor de los desposeídos durante el Dust Bowl',
    author: 'Premio Nobel de Literatura 1962',
    works: 'Las uvas de la ira · De ratones y hombres',
    year: 'Salinas, California',
    badge: 'Realismo Social',
    bg: '#431407',
    accent: '#fb923c',
    secondary: '#fde047',
    symbol: '🌾',
  },
  {
    filename: 'las_uvas_de_la_ira.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XX',
    title: 'Las Uvas de la Ira',
    subtitle: 'The Grapes of Wrath: La peregrinación campesina hacia California',
    author: 'John Steinbeck',
    works: 'Publicado en 1939 · Premio Pulitzer',
    year: 'Ruta 66 / California',
    badge: 'Testimonio de Época',
    bg: '#713f12',
    accent: '#eab308',
    secondary: '#ef4444',
    symbol: '🚜',
  },
  {
    filename: 'raymond_carver.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XX',
    title: 'Raymond Carver',
    subtitle: 'Maestro de la elipsis, la sencillez descarnada y el silencio',
    author: '1938 – 1988',
    works: 'De qué hablamos cuando hablamos de amor · Catedral',
    year: 'Noroeste de EE. UU.',
    badge: 'Realismo Sucio',
    bg: '#090d16',
    accent: '#38bdf8',
    secondary: '#94a3b8',
    symbol: '☕',
  },
  {
    filename: 'de_que_hablamos.jpg',
    category: 'AMÉRICA DEL NORTE · SIGLO XX',
    title: 'De qué hablamos cuando...',
    subtitle: 'What We Talk About When We Talk About Love',
    author: 'Raymond Carver',
    works: 'Publicado en 1981',
    year: 'Estados Unidos contemporáneo',
    badge: 'Minimalismo y Cotidianidad',
    bg: '#2e1065',
    accent: '#f43f5e',
    secondary: '#38bdf8',
    symbol: '💬',
  },
];

function generateSvg(item) {
  const width = 800;
  const height = 500;

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="grad-center" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stop-color="${item.accent}" stop-opacity="0.25"/>
        <stop offset="60%" stop-color="${item.bg}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="gold-border" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${item.accent}" stop-opacity="0.8"/>
        <stop offset="50%" stop-color="${item.secondary}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${item.accent}" stop-opacity="0.4"/>
      </linearGradient>
      <linearGradient id="header-bar" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${item.accent}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${item.secondary}" stop-opacity="0.8"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${width}" height="${height}" fill="#050811"/>
    <rect width="${width}" height="${height}" fill="url(#grad-center)"/>

    <!-- Subtle texture grid -->
    <path d="M 40 40 L 760 40 L 760 460 L 40 460 Z" fill="none" stroke="url(#gold-border)" stroke-width="2" stroke-dasharray="8 4" opacity="0.4"/>
    <rect x="50" y="50" width="700" height="400" rx="8" fill="#080d1a" fill-opacity="0.85" stroke="url(#gold-border)" stroke-width="1.5"/>

    <!-- Corner Ornaments -->
    <circle cx="50" cy="50" r="6" fill="${item.accent}" />
    <circle cx="750" cy="50" r="6" fill="${item.accent}" />
    <circle cx="50" cy="450" r="6" fill="${item.accent}" />
    <circle cx="750" cy="450" r="6" fill="${item.accent}" />

    <!-- Top Badge Header -->
    <rect x="80" y="75" width="280" height="26" rx="4" fill="${item.accent}" fill-opacity="0.15" stroke="${item.accent}" stroke-width="1"/>
    <text x="92" y="93" fill="${item.accent}" font-family="sans-serif" font-size="11" font-weight="700" letter-spacing="1.5">${escapeXml(item.category)}</text>

    <!-- Category Emblem / Icon -->
    <g transform="translate(670, 75)">
      <circle cx="20" cy="20" r="28" fill="${item.accent}" fill-opacity="0.12" stroke="${item.accent}" stroke-width="1.5"/>
      <text x="20" y="27" font-size="24" text-anchor="middle">${item.symbol}</text>
    </g>

    <!-- Main Title -->
    <text x="80" y="150" fill="#f8fafc" font-family="'Georgia', serif" font-size="34" font-weight="700">
      ${escapeXml(item.title)}
    </text>

    <!-- Accent divider -->
    <rect x="80" y="172" width="120" height="3" fill="url(#header-bar)" rx="1.5"/>

    <!-- Subtitle / Quote -->
    <text x="80" y="210" fill="#cbd5e1" font-family="sans-serif" font-size="16" font-weight="400">
      ${escapeXml(item.subtitle)}
    </text>

    <!-- Metadata Panel Box -->
    <rect x="80" y="245" width="640" height="135" rx="6" fill="#030712" fill-opacity="0.75" stroke="#334155" stroke-width="1"/>

    <!-- Field 1: Autor / Creador -->
    <text x="105" y="280" fill="${item.accent}" font-family="monospace" font-size="11" font-weight="700" letter-spacing="1">AUTOR / MOVIMIENTO:</text>
    <text x="105" y="302" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="600">${escapeXml(item.author)}</text>

    <!-- Field 2: Obras / Conceptos Clave -->
    <text x="105" y="336" fill="${item.secondary}" font-family="monospace" font-size="11" font-weight="700" letter-spacing="1">OBRAS / DETALLE:</text>
    <text x="105" y="358" fill="#e2e8f0" font-family="sans-serif" font-size="14" font-weight="400">${escapeXml(item.works)}</text>

    <!-- Footer Bar -->
    <line x1="80" y1="410" x2="720" y2="410" stroke="#1e293b" stroke-width="1"/>

    <text x="80" y="432" fill="#94a3b8" font-family="sans-serif" font-size="12">
      📍 ${escapeXml(item.year)}
    </text>

    <rect x="520" y="416" width="200" height="24" rx="4" fill="${item.accent}" fill-opacity="0.12" stroke="${item.accent}" stroke-width="1"/>
    <text x="620" y="432" fill="${item.accent}" font-family="sans-serif" font-size="11" font-weight="600" text-anchor="middle">
      ★ ${escapeXml(item.badge)}
    </text>

    <!-- Exposition attribution tag -->
    <text x="400" y="475" fill="#64748b" font-family="sans-serif" font-size="10" text-anchor="middle">
      Exposición: El Realismo en la Literatura · Juan David De Avila Delgado
    </text>
  </svg>
  `;
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
}

async function run() {
  console.log(`Generando ${assets.length} recursos multimedia en ${outputDir}...`);
  for (const asset of assets) {
    const svg = generateSvg(asset);
    const targetPath = path.join(outputDir, asset.filename);
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 92 })
      .toFile(targetPath);
    console.log(`✓ Creado: ${asset.filename}`);
  }
  console.log('¡Todos los recursos multimedia han sido generados exitosamente!');
}

run().catch((err) => {
  console.error('Error generando assets:', err);
  process.exit(1);
});
