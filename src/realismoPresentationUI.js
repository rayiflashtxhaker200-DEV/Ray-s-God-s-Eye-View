/**
 * Infocard Overlay Component para God's Eye View
 * Exposición escolar: "El Realismo en la Literatura"
 * Creada por: Juan David De Avila Delgado
 */

import * as Cesium from 'cesium';
import { REALISMO_PRESENTATION_BLOCKS, getBlockById } from './realismoLocations.js';
import { holdContinuousRender, releaseContinuousRender, governorRequestRender } from './renderGovernor.js';

let currentBlockIndex = 0;
let currentImageIndex = 0;
let overlayElement = null;
let currentViewer = null;
let isCollapsed = false;

/**
 * Fly camera to a presentation block's coordinates.
 */
export function flyToPresentationBlock(block, viewer = currentViewer) {
  if (!block || !block.coordinates) return;
  const { lat, lng, alt } = block.coordinates;
  const targetViewer = viewer || (typeof window !== 'undefined' ? window.__godsEyeView?.viewer : null);

  if (targetViewer?.camera?.flyTo) {
    holdContinuousRender('realismo-flight');
    governorRequestRender();
    const destination = Cesium.Cartesian3.fromDegrees(lng, lat, alt || 1800000);
    targetViewer.camera.flyTo({
      destination,
      duration: 2.2,
      complete: () => {
        releaseContinuousRender('realismo-flight');
        governorRequestRender();
      },
      cancel: () => {
        releaseContinuousRender('realismo-flight');
        governorRequestRender();
      },
    });
  }
}

/**
 * Mount the visual Infocard component onto the main page.
 */
export function mountRealismoPresentation({ viewer, container = document.body } = {}) {
  currentViewer = viewer || (typeof window !== 'undefined' ? window.__godsEyeView?.viewer : null);

  // If already mounted, update viewer reference and return
  if (overlayElement && overlayElement.parentNode) {
    return {
      selectBlock,
      nextBlock,
      prevBlock,
      destroy,
    };
  }

  overlayElement = document.createElement('div');
  overlayElement.id = 'gev-realismo-infocard';
  overlayElement.style.cssText = `
    position: fixed;
    top: 64px;
    right: 18px;
    width: 440px;
    max-width: calc(100vw - 36px);
    max-height: calc(100vh - 120px);
    z-index: 1000;
    pointer-events: auto;
    font-family: 'Inter', -apple-system, sans-serif;
    color: #f1f5f9;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    filter: drop-shadow(0 20px 30px rgba(0,0,0,0.7));
  `;

  renderInfocardContent();
  container.appendChild(overlayElement);

  // Keyboard navigation shortcuts: numbers 1-5, ArrowLeft / ArrowRight
  const keyHandler = (e) => {
    // Only if not typing in an input
    if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
    if (e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key, 10) - 1;
      selectBlock(idx, true);
    } else if (e.key === 'ArrowRight' && (e.ctrlKey || e.altKey)) {
      nextBlock(true);
    } else if (e.key === 'ArrowLeft' && (e.ctrlKey || e.altKey)) {
      prevBlock(true);
    }
  };
  window.addEventListener('keydown', keyHandler);

  function destroy() {
    window.removeEventListener('keydown', keyHandler);
    if (overlayElement?.parentNode) {
      overlayElement.parentNode.removeChild(overlayElement);
      overlayElement = null;
    }
  }

  // Initial flight to block 0
  setTimeout(() => {
    flyToPresentationBlock(REALISMO_PRESENTATION_BLOCKS[0], currentViewer);
  }, 1000);

  return {
    selectBlock,
    nextBlock,
    prevBlock,
    destroy,
  };
}

/**
 * Switch to a specific block by ID or index.
 */
export function selectBlock(idOrIndex, triggerFlight = true) {
  let index = 0;
  if (typeof idOrIndex === 'number') {
    index = Math.max(0, Math.min(idOrIndex, REALISMO_PRESENTATION_BLOCKS.length - 1));
  } else {
    index = REALISMO_PRESENTATION_BLOCKS.findIndex((b) => b.id === idOrIndex);
    if (index === -1) index = 0;
  }

  currentBlockIndex = index;
  currentImageIndex = 0;
  isCollapsed = false;

  renderInfocardContent();

  const block = REALISMO_PRESENTATION_BLOCKS[currentBlockIndex];
  if (triggerFlight && block) {
    flyToPresentationBlock(block, currentViewer);
  }

  // Dispatch custom event for listener sync
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gev:realismo-block-changed', {
        detail: { index: currentBlockIndex, block },
      })
    );
  }
}

export function nextBlock(triggerFlight = true) {
  const next = (currentBlockIndex + 1) % REALISMO_PRESENTATION_BLOCKS.length;
  selectBlock(next, triggerFlight);
}

export function prevBlock(triggerFlight = true) {
  const prev = (currentBlockIndex - 1 + REALISMO_PRESENTATION_BLOCKS.length) % REALISMO_PRESENTATION_BLOCKS.length;
  selectBlock(prev, triggerFlight);
}

/**
 * Render or re-render the infocard HTML.
 */
function renderInfocardContent() {
  if (!overlayElement) return;
  const block = REALISMO_PRESENTATION_BLOCKS[currentBlockIndex] || REALISMO_PRESENTATION_BLOCKS[0];
  const images = block.images || [];
  const currentImg = images[currentImageIndex] || images[0] || null;

  if (isCollapsed) {
    overlayElement.innerHTML = `
      <div style="
        background: rgba(10, 15, 29, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 12px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📖</span>
          <div>
            <div style="font-size: 10px; text-transform: uppercase; color: #38bdf8; font-weight: 700; letter-spacing: 1px;">
              ${escapeHtml(block.shortLabel || block.buttonLabel)}
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #fff; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(block.title)}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="btn-re-fly" title="Volar a la ubicación" style="
            background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8;
            border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;
          ">🎯</button>
          <button id="btn-toggle-expand" title="Desplegar ficha informativa" style="
            background: #0284c7; border: none; color: #fff;
            border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
          ">＋ Expandir</button>
        </div>
      </div>
    `;

    overlayElement.querySelector('#btn-toggle-expand').addEventListener('click', () => {
      isCollapsed = false;
      renderInfocardContent();
    });
    overlayElement.querySelector('#btn-re-fly').addEventListener('click', () => {
      flyToPresentationBlock(block, currentViewer);
    });
    return;
  }

  overlayElement.innerHTML = `
    <div style="
      background: rgba(10, 15, 29, 0.94);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
    ">
      <!-- Top Title Bar -->
      <div style="
        background: linear-gradient(90deg, rgba(2, 132, 199, 0.25) 0%, rgba(15, 23, 42, 0.8) 100%);
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        padding: 12px 14px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      ">
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
            <span style="font-size: 9.5px; font-weight: 700; letter-spacing: 1.5px; color: #38bdf8; text-transform: uppercase;">
              Exposición Escolar · Juan David De Avila Delgado
            </span>
          </div>
          <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px; line-height: 1.25;">
            ${escapeHtml(block.title)}
          </h2>
          ${block.subtitle ? `
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px; font-style: italic;">
              ${escapeHtml(block.subtitle)}
            </div>
          ` : ''}
          ${block.period ? `
            <div style="margin-top: 4px;">
              <span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; display: inline-block;">
                ⏳ ${escapeHtml(block.period)}
              </span>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 4px; align-items: center;">
          <button id="btn-re-fly" title="Re-centrar cámara en 3D" style="
            background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; color: #38bdf8;
            border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center;
            justify-content: center; font-size: 13px; cursor: pointer; transition: all 0.2s;
          ">🎯</button>
          <button id="btn-toggle-collapse" title="Minimizar panel" style="
            background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; color: #cbd5e1;
            border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center;
            justify-content: center; font-size: 13px; cursor: pointer; font-weight: 700;
          ">－</button>
        </div>
      </div>

      <!-- Scrollable Body Content -->
      <div style="
        padding: 14px;
        overflow-y: auto;
        max-height: calc(100vh - 280px);
        display: flex;
        flex-direction: column;
        gap: 12px;
      ">
        <!-- Characteristics / Context -->
        ${block.characteristics ? `
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 8px; padding: 10px 12px; font-size: 12.5px; line-height: 1.5; color: #e2e8f0;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px;">
              📌 Contexto e Identidad
            </div>
            ${escapeHtml(block.characteristics)}
          </div>
        ` : ''}

        <!-- Literary Movements & Key Works -->
        ${block.sections && block.sections.length ? `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8;">
              🎭 Movimientos y Obras Clave
            </div>
            ${block.sections.map((sec) => `
              <div style="
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(30, 41, 59, 0.9);
                border-left: 3px solid #0284c7;
                border-radius: 6px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 5px;
              ">
                <div style="font-size: 13px; font-weight: 700; color: #f8fafc;">
                  ${escapeHtml(sec.movement)}
                </div>

                ${sec.details ? `
                  <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.4;">
                    ${escapeHtml(sec.details)}
                  </div>
                ` : ''}

                ${sec.authorsAndWorks ? `
                  <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
                    ${sec.authorsAndWorks.map((aw) => `
                      <div style="font-size: 11px; color: #38bdf8; display: flex; align-items: center; gap: 5px;">
                        <span>📖</span>
                        <strong>${escapeHtml(aw)}</strong>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}

                ${sec.authors || sec.works ? `
                  <div style="font-size: 11.5px; color: #93c5fd; margin-top: 2px;">
                    ${sec.authors ? `<strong>Autores:</strong> ${escapeHtml(sec.authors.join(', '))}<br/>` : ''}
                    ${sec.works ? `<strong>Obras:</strong> ${escapeHtml(sec.works.join(', '))}` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Relación / Transición con Europa Box -->
        ${(block.transitionToAmerica || (block.sections && block.sections.some(s => s.relationToEurope))) ? `
          <div style="
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.04) 100%);
            border: 1px solid rgba(245, 158, 11, 0.35);
            border-radius: 8px;
            padding: 10px 12px;
          ">
            <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
              <span>🌐</span> Relación / Transición con Europa
            </div>
            ${block.transitionToAmerica ? `
              <div style="font-size: 12px; color: #fde68a; line-height: 1.45; margin-bottom: 4px;">
                ${escapeHtml(block.transitionToAmerica)}
              </div>
            ` : ''}
            ${block.sections && block.sections.map(s => s.relationToEurope ? `
              <div style="font-size: 11.5px; color: #fef08a; line-height: 1.4; margin-top: 4px; padding-left: 8px; border-left: 2px solid rgba(245,158,11,0.5);">
                <strong>${escapeHtml(s.movement)}:</strong> ${escapeHtml(s.relationToEurope)}
              </div>
            ` : '').join('')}
          </div>
        ` : ''}

        <!-- Image Gallery / Carousel -->
        ${currentImg ? `
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">
                🖼️ Galería Visual (${currentImageIndex + 1} de ${images.length})
              </span>
              <button id="btn-fullscreen-img" style="
                background: transparent; border: none; color: #38bdf8; font-size: 11px; cursor: pointer; text-decoration: underline;
              ">Ampliar foto ⤢</button>
            </div>

            <!-- Main Image Preview Card -->
            <div style="
              border-radius: 8px;
              overflow: hidden;
              background: #020617;
              border: 1px solid rgba(56, 189, 248, 0.3);
              position: relative;
            ">
              <img
                id="main-preview-img"
                src="${currentImg.src}"
                alt="${escapeHtml(currentImg.title)}"
                style="width: 100%; height: 175px; object-fit: cover; display: block; cursor: pointer;"
              />
              <div style="
                background: rgba(3, 7, 18, 0.9);
                padding: 6px 10px;
                border-top: 1px solid rgba(51, 65, 85, 0.5);
              ">
                <div style="font-size: 12px; font-weight: 600; color: #fff;">
                  ${escapeHtml(currentImg.title)}
                </div>
                <div style="font-size: 10.5px; color: #94a3b8; margin-top: 1px;">
                  ${escapeHtml(currentImg.caption || '')}
                </div>
              </div>
            </div>

            <!-- Thumbnail Selector Strip -->
            ${images.length > 1 ? `
              <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
                ${images.map((img, idx) => `
                  <button class="btn-thumb-img" data-idx="${idx}" style="
                    background: none; border: ${idx === currentImageIndex ? '2px solid #38bdf8' : '1px solid #334155'};
                    border-radius: 6px; padding: 0; width: 56px; height: 38px; overflow: hidden; cursor: pointer;
                    flex-shrink: 0; opacity: ${idx === currentImageIndex ? '1' : '0.6'}; transition: all 0.2s;
                  ">
                    <img src="${img.src}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Navigation & Stage Selector Footer -->
      <div style="
        background: rgba(15, 23, 42, 0.95);
        border-top: 1px solid rgba(56, 189, 248, 0.2);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      ">
        <!-- 5-Block Pill Selector -->
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;">
          ${REALISMO_PRESENTATION_BLOCKS.map((b, i) => `
            <button class="btn-block-nav" data-idx="${i}" style="
              background: ${i === currentBlockIndex ? '#0284c7' : 'rgba(30, 41, 59, 0.8)'};
              border: 1px solid ${i === currentBlockIndex ? '#38bdf8' : '#334155'};
              color: ${i === currentBlockIndex ? '#fff' : '#94a3b8'};
              border-radius: 6px;
              padding: 6px 2px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            " title="${escapeHtml(b.buttonLabel)}">
              ${escapeHtml(b.shortLabel || `${i + 1}. Bloque`)}
            </button>
          `).join('')}
        </div>

        <!-- Next / Prev Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button id="btn-prev-block" style="
            background: #1e293b; border: 1px solid #334155; color: #cbd5e1;
            border-radius: 6px; padding: 6px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;
          ">
            ◀ Anterior
          </button>
          <span style="font-size: 11px; color: #64748b; font-family: monospace;">
            Diapositiva ${currentBlockIndex + 1} / ${REALISMO_PRESENTATION_BLOCKS.length}
          </span>
          <button id="btn-next-block" style="
            background: #0284c7; border: 1px solid #38bdf8; color: #fff;
            border-radius: 6px; padding: 6px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;
          ">
            Siguiente ▶
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach Event Listeners
  overlayElement.querySelector('#btn-toggle-collapse')?.addEventListener('click', () => {
    isCollapsed = true;
    renderInfocardContent();
  });

  overlayElement.querySelector('#btn-re-fly')?.addEventListener('click', () => {
    flyToPresentationBlock(block, currentViewer);
  });

  overlayElement.querySelector('#btn-prev-block')?.addEventListener('click', () => {
    prevBlock(true);
  });

  overlayElement.querySelector('#btn-next-block')?.addEventListener('click', () => {
    nextBlock(true);
  });

  overlayElement.querySelectorAll('.btn-block-nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-idx'));
      selectBlock(idx, true);
    });
  });

  overlayElement.querySelectorAll('.btn-thumb-img').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentImageIndex = Number(btn.getAttribute('data-idx'));
      renderInfocardContent();
    });
  });

  // Modal zoom
  const openModal = () => {
    if (currentImg) {
      showImageModal(currentImg);
    }
  };
  overlayElement.querySelector('#main-preview-img')?.addEventListener('click', openModal);
  overlayElement.querySelector('#btn-fullscreen-img')?.addEventListener('click', openModal);
}

/**
 * Fullscreen Image Viewer Modal
 */
function showImageModal(imgObj) {
  const existing = document.getElementById('gev-image-zoom-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'gev-image-zoom-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,0.88);
    backdrop-filter: blur(12px); display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;
  `;

  modal.innerHTML = `
    <div style="max-width: 900px; width: 100%; display: flex; flex-direction: column; gap: 12px; position: relative;">
      <button id="btn-close-modal" style="
        position: absolute; top: -38px; right: 0; background: #334155; border: none;
        color: #fff; width: 32px; height: 32px; border-radius: 50%; font-size: 16px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      ">✕</button>
      <img src="${imgObj.src}" style="max-height: 75vh; width: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 25px 50px rgba(0,0,0,0.9); border: 1px solid #334155;" />
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; color: #fff;">
        <div style="font-size: 16px; font-weight: 700; color: #38bdf8;">${escapeHtml(imgObj.title)}</div>
        <div style="font-size: 13px; color: #cbd5e1; margin-top: 4px;">${escapeHtml(imgObj.caption || '')}</div>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.id === 'btn-close-modal') {
      modal.remove();
    }
  });

  document.body.appendChild(modal);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
