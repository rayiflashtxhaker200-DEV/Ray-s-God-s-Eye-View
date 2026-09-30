/**
 * 5 Bloques Temáticos: El Realismo en la Literatura
 * Exposición escolar de Juan David De Avila Delgado
 */

export const REALISMO_PRESENTATION_BLOCKS = [
  {
    id: '1_europa_origen',
    buttonLabel: '1. Origen: Europa a América',
    shortLabel: '1. Europa',
    coordinates: { lat: 48.8566, lng: 2.3522, alt: 2000000 },
    title: 'Origen y Evolución: Europa a América',
    subtitle: 'El nacimiento de la mirada objetiva',
    period: 'Siglo XIX - Francia y Transición',
    characteristics: 'Nace en Francia como reacción objetiva al Romanticismo, influenciado por el positivismo y centrado en la burguesía y la industrialización.',
    transitionToAmerica: 'Adopta la observación directa europea pero reemplaza la ciudad burguesa por la naturaleza indómita, la búsqueda de identidad nacional y los tipos rurales.',
    sections: [
      {
        movement: 'Realismo Europeo',
        authors: ['Gustave Flaubert', 'Honoré de Balzac'],
        works: ['Madame Bovary', 'La Comedia Humana'],
        details: 'Observación científica y documental de la sociedad burguesa, desencanto y crítica social descarnada.',
        relationToEurope: 'Cuna del movimiento: rigor de observación, impersonalidad del narrador y rechazo al idealismo subjetivo romántico.'
      }
    ],
    images: [
      {
        src: '/assets/realismo/europa_burguesia.jpg',
        title: 'Realismo Europeo y Burguesía',
        caption: 'La vida burguesa e industrialización urbana en Francia durante el siglo XIX.'
      }
    ]
  },
  {
    id: '2_sur_siglo_xix',
    buttonLabel: '2. América del Sur (S. XIX)',
    shortLabel: '2. Sur XIX',
    coordinates: { lat: -34.6037, lng: -58.3816, alt: 1800000 },
    title: 'América del Sur — Siglo XIX',
    subtitle: 'El descubrimiento de lo propio',
    period: 'Segunda mitad del Siglo XIX',
    characteristics: 'Consolidación de las jóvenes repúblicas sudamericanas; choque cultural entre las ciudades letradas de élite y el mundo rural campesino, gaucho e indígena.',
    transitionToAmerica: 'Reemplaza al burgués de salón parisino por figuras criollas arquetípicas: el gaucho en la pampa, el andino en la cordillera y el llanero en las sabanas.',
    sections: [
      {
        movement: 'Costumbrismo',
        details: 'Retrato minucioso de hábitos, dialectos vernáculos y tipos humanos rurales (El Gaucho, El Andino, El Llanero).',
        authorsAndWorks: [
          'José Hernández — El Gaucho Martín Fierro',
          'Eugenio Díaz Castro — Manuela',
          'El Murciélago (Prensa satírica y crónica social)'
        ],
        relationToEurope: 'Reemplaza al burgués europeo por tipos criollos y locales, registrando el lenguaje popular frente al canon académico español.'
      },
      {
        movement: 'Civilización vs. Barbarie',
        details: 'El gran dilema fundacional: conflicto entre el progreso urbano de corte europeo y la vida indómita nativa o rural.',
        authorsAndWorks: ['Domingo Faustino Sarmiento — Facundo (1845)'],
        relationToEurope: 'Debate ideológico sobre importar ciegamente las instituciones europeas o comprender la naturaleza sociológica americana.'
      },
      {
        movement: 'Realismo Brasileño',
        details: 'Análisis científico del territorio geográfico, transformación rural-urbana e impacto del progreso tecnológico (ferrocarril).',
        authorsAndWorks: ['El Brasil: La tierra y el hombre'],
        relationToEurope: 'Documenta la inserción del capital y la maquinaria europea en el trópico virgen.'
      }
    ],
    images: [
      {
        src: '/assets/realismo/jose_hernandez.jpg',
        title: 'José Hernández (1834-1886)',
        caption: 'Poeta, militar y periodista argentino; inmortalizó la voz del gaucho perseguido.'
      },
      {
        src: '/assets/realismo/martin_fierro.jpg',
        title: 'El Gaucho Martín Fierro (1872)',
        caption: 'Poema épico nacional y máxima expresión de la literatura gauchesca rioplatense.'
      },
      {
        src: '/assets/realismo/eugenio_diaz_castro.jpg',
        title: 'Eugenio Díaz Castro (1804-1865)',
        caption: 'Pionero de la novela de costumbres colombiana y fundador de El Mosaico.'
      },
      {
        src: '/assets/realismo/manuela.jpg',
        title: 'Manuela (1858)',
        caption: 'Novela costumbrista que retrata las tensiones campesinas y políticas en la cordillera andina.'
      },
      {
        src: '/assets/realismo/el_murcielago.jpg',
        title: 'El Murciélago',
        caption: 'Sátira social, crónica de costumbres y crítica política de la época republicana.'
      },
      {
        src: '/assets/realismo/facundo.jpg',
        title: 'Facundo: Civilización y Barbarie (1845)',
        caption: 'Obra magistral de Sarmiento sobre el caudillismo y el destino de Sudamérica.'
      },
      {
        src: '/assets/realismo/brasil_tierra_hombre.jpg',
        title: 'El Brasil: La Tierra y el Hombre',
        caption: 'Realismo geográfico y social brasileño: interacción entre el suelo y sus habitantes.'
      },
      {
        src: '/assets/realismo/ferrocarril_paisaje.jpg',
        title: 'El Ferrocarril y el Progreso',
        caption: 'Llegada de los rieles a los valles y llanuras sudamericanas durante el siglo XIX.'
      }
    ]
  },
  {
    id: '3_sur_siglo_xx',
    buttonLabel: '3. América del Sur (S. XX)',
    shortLabel: '3. Sur XX',
    coordinates: { lat: 1.2136, lng: -70.2312, alt: 1500000 },
    title: 'América del Sur — Siglo XX',
    subtitle: 'La tierra y la protesta',
    period: 'Primeras décadas del Siglo XX',
    characteristics: 'La literatura abandona el pintoresquismo costumbrista para convertirse en trinchera de combate social, exponiendo el horror de las caucherías y el despojo del pueblo originario.',
    transitionToAmerica: 'Hereda el naturalismo determinista de Émile Zola pero lo traslada al infierno verde amazónico y a las alturas andinas donde manda la ley de la fuerza.',
    sections: [
      {
        movement: 'Novela de la Tierra / Regionalismo',
        details: 'Lucha titánica y sometimiento trágico del ser humano ante una naturaleza salvaje y despiadada.',
        authorsAndWorks: ['José Eustasio Rivera — La Vorágine (1924)'],
        relationToEurope: 'Derivado del Naturalismo (determinismo ambiental): la selva devora civilización, moral y razón.'
      },
      {
        movement: 'Indigenismo',
        details: 'Denuncia explícita, testimonial y cruda del despojo de tierras y la explotación feudal indígena.',
        authorsAndWorks: ['Jorge Icaza — Huasipungo (1934)'],
        relationToEurope: 'Ruptura radical con la visión exótica del "buen salvaje": muestra el dolor físico y la rebelión de la masa oprimida.'
      }
    ],
    images: [
      {
        src: '/assets/realismo/la_voragine.jpg',
        title: 'La Vorágine (1924)',
        caption: 'Novela cumbre de José Eustasio Rivera: drama de los llanos, la selva y las caucherías.'
      },
      {
        src: '/assets/realismo/huasipungo.jpg',
        title: 'Huasipungo (1934)',
        caption: 'Jorge Icaza desnuda la opresión de los indígenas ecuatorianos frente a terratenientes.'
      },
      {
        src: '/assets/realismo/selva_amazonica.jpg',
        title: 'La Selva Amazónica',
        caption: 'Escenario voraz e implacable: la naturaleza como personaje protagónico determinante.'
      }
    ]
  },
  {
    id: '4_norte_siglo_xix',
    buttonLabel: '4. América del Norte (S. XIX)',
    shortLabel: '4. Norte XIX',
    coordinates: { lat: 37.0902, lng: -95.7129, alt: 2200000 },
    title: 'América del Norte — Siglo XIX',
    subtitle: 'Un redescubrimiento propio',
    period: 'Post-Guerra de Secesión (Finales del Siglo XIX)',
    characteristics: 'Nacimiento de una literatura auténticamente estadounidense, alejada del corset victoriano europeo mediante la voz de la gente común y la exploración del inconsciente.',
    transitionToAmerica: 'Crea una lengua literaria nueva a partir del dialecto de los márgenes y combina la introspección psicológica europea con la amplitud geográfica de la frontera.',
    sections: [
      {
        movement: 'Regionalismo (Local Color)',
        details: 'Registro fiel del dialecto popular, folclor, picardía y vida marginal a orillas del río Misisipi.',
        authorsAndWorks: ['Mark Twain — Las aventuras de Huckleberry Finn (1884)'],
        relationToEurope: 'Emancipación formal de la tradición literaria británica: el habla popular como lengua artística definitiva.'
      },
      {
        movement: 'Realismo Psicológico',
        details: 'Estudio minucioso de los procesos mentales, dilemas morales íntimos, percepciones y ambigüedad.',
        authorsAndWorks: ['Henry James — Otra vuelta de tuerca (1898)'],
        relationToEurope: 'Conexión directa y sofisticada con la narrativa psicológica de Gustave Flaubert e Iván Turguénev.'
      }
    ],
    images: [
      {
        src: '/assets/realismo/mapa_norteamerica.jpg',
        title: 'Río Misisipi y Nueva Inglaterra',
        caption: 'Mapa histórico de la gran cuenca fluvial y los centros intelectuales norteamericanos.'
      },
      {
        src: '/assets/realismo/henry_james.jpg',
        title: 'Henry James (1843-1916)',
        caption: 'Maestro universal del punto de vista narrativo y el escrutinio psicológico.'
      },
      {
        src: '/assets/realismo/otra_vuelta_tuerca.jpg',
        title: 'Otra Vuelta de Tuerca (1898)',
        caption: 'Cúspide de la sugestión psicológica, la sospecha y el fantasma de la mente.'
      },
      {
        src: '/assets/realismo/huckleberry_finn.jpg',
        title: 'Las Aventuras de Huckleberry Finn (1884)',
        caption: 'La balsa de Huck y Jim: sátira moral y nacimiento de la moderna prosa americana.'
      }
    ]
  },
  {
    id: '5_norte_siglo_xx',
    buttonLabel: '5. América del Norte (S. XX)',
    shortLabel: '5. Norte XX',
    coordinates: { lat: 36.6777, lng: -121.6555, alt: 1800000 },
    title: 'América del Norte — Siglo XX',
    subtitle: 'Realismo Social y la "Otra Cara"',
    period: 'De la Gran Depresión (1930) a la Posguerra y Década de 1980',
    characteristics: 'Crítica frontal al espejismo del capitalismo triunfalista: éxodos de migrantes arruinados, desempleo, desolación íntima en moteles y cocinas suburbanas.',
    transitionToAmerica: 'Sustituye las extensas digresiones descriptivas de la novela decimonónica europea por una economía verbal tajante: diálogos lacónicos y situaciones de supervivencia.',
    sections: [
      {
        movement: 'Realismo Social',
        details: 'Registro testimonial de la gran crisis económica (Gran Depresión), el Dust Bowl y las clases trabajadoras migrantes.',
        authorsAndWorks: ['John Steinbeck — Las uvas de la ira (1939)'],
        relationToEurope: 'Realismo de combate proletario, humanismo ético frente al despojo corporativo de los bancos.'
      },
      {
        movement: 'Realismo Sucio (Dirty Realism)',
        details: 'Minimalismo narrativo implacable enfocado en la soledad, el desempleo, el alcoholismo y la cotidianidad herida.',
        authorsAndWorks: ['Raymond Carver — De qué hablamos cuando hablamos de amor (1981)'],
        relationToEurope: 'Rompe radicalmente con las florituras europeas decimonónicas mediante una prosa descarnada, silencios y elipsis.'
      }
    ],
    images: [
      {
        src: '/assets/realismo/john_steinbeck.jpg',
        title: 'John Steinbeck (1902-1968)',
        caption: 'Premio Nobel de Literatura; retrató con dignidad inquebrantable a los desposeídos.'
      },
      {
        src: '/assets/realismo/las_uvas_de_la_ira.jpg',
        title: 'Las Uvas de la Ira (1939)',
        caption: 'La epopeya trágica de la familia Joad huyendo del desierto hacia los campos de California.'
      },
      {
        src: '/assets/realismo/raymond_carver.jpg',
        title: 'Raymond Carver (1938-1988)',
        caption: 'Poeta y cuentista; emblema del realismo sucio y la desolación de la clase trabajadora.'
      },
      {
        src: '/assets/realismo/de_que_hablamos.jpg',
        title: 'De qué hablamos cuando hablamos de amor (1981)',
        caption: 'Colección de relatos minimalistas que capturan la fragilidad y el desamparo humano.'
      }
    ]
  }
];

export function getBlockById(id) {
  return REALISMO_PRESENTATION_BLOCKS.find((b) => b.id === id) || REALISMO_PRESENTATION_BLOCKS[0];
}

export function getBlockByIndex(index) {
  const safeIdx = Math.max(0, Math.min(index, REALISMO_PRESENTATION_BLOCKS.length - 1));
  return REALISMO_PRESENTATION_BLOCKS[safeIdx];
}
