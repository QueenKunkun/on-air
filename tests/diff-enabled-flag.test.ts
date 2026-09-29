import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFlagOn } from '../src/frontend/hooks/useLocalStorage';

test('isFlagOn: only "1" and legacy "true" are on', () => {
	assert.equal(isFlagOn('1'), true);
	assert.equal(isFlagOn('true'), true);
});

test('isFlagOn: "0", "false", empty and null are off', () => {
	// "false" is the regression: a plain truthiness check treats it as on
	assert.equal(isFlagOn('0'), false);
	assert.equal(isFlagOn('false'), false);
	assert.equal(isFlagOn(''), false);
	assert.equal(isFlagOn(null), false);
	assert.equal(isFlagOn(undefined), false);
});
