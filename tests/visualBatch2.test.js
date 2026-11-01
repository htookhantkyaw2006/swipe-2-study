import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVisualBatch2Verification } from './runVisualBatch2Check.mjs';

test('UI/UX Batch 2: vocabulary study, Review, Saved Words, and session results visual verification', async (t) => {
  const result = await runVisualBatch2Verification();
  if (result.skipped) {
    t.skip(`Interactive visual acceptance unverified: ${result.reason}`);
    return;
  }

  assert.equal(result.passed, true, 'Batch 2 visual checks must pass');
  assert.equal(result.screenshots.length, 5, '5 screenshots captured across 320, 375, 768, 1024, 1440px viewports');
});
