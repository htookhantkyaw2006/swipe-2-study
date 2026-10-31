import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVisualBatch1Verification } from './runVisualBatch1Check.mjs';

test('UI/UX Batch 1: visual foundation, Home, and vocabulary course entry verification', async (t) => {
  const result = await runVisualBatch1Verification();
  if (result.skipped) {
    t.skip(`Interactive visual acceptance unverified: ${result.reason}`);
    return;
  }

  assert.equal(result.passed, true, 'Batch 1 visual and interaction checks must pass');
  assert.ok(result.results.length >= 4, 'All 4 verification stages executed');
  assert.equal(result.screenshots.length, 5, '5 screenshots captured across 320, 375, 768, 1024, 1440px viewports');
});
