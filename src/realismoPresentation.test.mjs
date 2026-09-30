import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REALISMO_PRESENTATION_BLOCKS, getBlockById, getBlockByIndex } from './realismoLocations.js';
import { executeRemoteCommand } from './mobileRemoteController.js';

test('5 presentation blocks exist in exact chronological sequence', () => {
  assert.equal(REALISMO_PRESENTATION_BLOCKS.length, 5);

  const expectedIds = [
    '1_europa_origen',
    '2_sur_siglo_xix',
    '3_sur_siglo_xx',
    '4_norte_siglo_xix',
    '5_norte_siglo_xx',
  ];

  for (let i = 0; i < expectedIds.length; i++) {
    assert.equal(REALISMO_PRESENTATION_BLOCKS[i].id, expectedIds[i]);
    assert.ok(REALISMO_PRESENTATION_BLOCKS[i].coordinates.lat !== undefined);
    assert.ok(REALISMO_PRESENTATION_BLOCKS[i].coordinates.lng !== undefined);
    assert.ok(REALISMO_PRESENTATION_BLOCKS[i].coordinates.alt >= 1000000);
    assert.ok(REALISMO_PRESENTATION_BLOCKS[i].sections.length > 0);
  }
});

test('all 20 image assets exist on local disk in public/assets/realismo/', () => {
  const publicDir = path.resolve('public');
  let checkedCount = 0;

  for (const block of REALISMO_PRESENTATION_BLOCKS) {
    for (const img of block.images) {
      const relPath = img.src.replace(/^\//, '');
      const fullPath = path.join(publicDir, relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `Missing image file: ${relPath} (expected at ${fullPath})`
      );
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 1000, `Image file is empty or corrupted: ${relPath}`);
      checkedCount++;
    }
  }

  assert.equal(checkedCount, 20);
});

test('locations.json in public root is valid JSON and matches presentation structure', () => {
  const jsonPath = path.resolve('public/locations.json');
  assert.ok(fs.existsSync(jsonPath));
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.length, 5);
  assert.equal(data[0].id, '1_europa_origen');
  assert.equal(data[1].id, '2_sur_siglo_xix');
  assert.equal(data[2].id, '3_sur_siglo_xx');
  assert.equal(data[3].id, '4_norte_siglo_xix');
  assert.equal(data[4].id, '5_norte_siglo_xx');
});

test('executeRemoteCommand handles show_presentation_block and presentation_nav', () => {
  let selectedBlock = null;
  let navDirection = null;

  globalThis.window = {
    __selectRealismoBlock: (id) => { selectedBlock = id; },
    __nextRealismoBlock: () => { navDirection = 'next'; },
    __prevRealismoBlock: () => { navDirection = 'prev'; },
  };

  const executed1 = executeRemoteCommand({
    action: 'show_presentation_block',
    args: { blockId: '2_sur_siglo_xix' },
  });
  assert.equal(executed1, true);
  assert.equal(selectedBlock, '2_sur_siglo_xix');

  const executed2 = executeRemoteCommand({
    action: 'presentation_nav',
    args: { direction: 'next' },
  });
  assert.equal(executed2, true);
  assert.equal(navDirection, 'next');

  const executed3 = executeRemoteCommand({
    action: 'presentation_nav',
    args: { direction: 'prev' },
  });
  assert.equal(executed3, true);
  assert.equal(navDirection, 'prev');

  delete globalThis.window;
});
