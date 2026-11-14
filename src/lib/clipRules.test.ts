import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { allChecks, cleanFilename, clipFilename, emptyChecks, validRange, type ClipRecord } from './clipRules.js';
test('invalid boundary is rejected', () => {
  assert.equal(validRange(2, 1), false);
  assert.equal(validRange(-0.01, 1), false);
  assert.equal(validRange(1, 2, 1.2), false);
  assert.equal(validRange(1, 1.5, 3), true);
});
test('all six manual checks required', () => {
  const checks = emptyChecks();
  assert.equal(allChecks(checks), false);
  Object.keys(checks).forEach(k => { checks[k as keyof typeof checks] = true; });
  assert.equal(allChecks(checks), true);
});
test('Czech diacritics survive filename normalization', () => {
  assert.equal(cleanFilename('růžová / zlatá'), 'růžová _ zlatá');
  const clip: ClipRecord = {
    id:'c1', sourcePart:'004', wordNo:95, czechWord:'růžová', czechSentence:'Nemám růžovou košili.',
    role:'sentence_normal', start:1, end:3, status:'REVIEW_REQUIRED', updatedAt:'', checks:emptyChecks(),
  };
  assert.equal(clipFilename(clip),'0095_Nemám růžovou košili.__sentence_normal');
});
