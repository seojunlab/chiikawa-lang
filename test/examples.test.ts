import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run } from '../src/core.ts';

const ex = (name: string, input = '') => run(readFileSync(`examples/${name}.chiikawa`, 'utf8'), input);

test('hello', () => assert.equal(ex('hello'), 'Hello, World!\n'));
test('annyeong', () => assert.equal(ex('annyeong'), '안녕, 치이카와!\n'));
test('cat', () => assert.equal(ex('cat', '우라! 야하!'), '우라! 야하!'));
test('reverse', () => assert.equal(ex('reverse', 'abc'), 'cba'));
test('countdown', () => assert.equal(ex('countdown'), '9 8 7 6 5 4 3 2 1 0\n'));
test('triangle', () => assert.equal(ex('triangle'), '*\n**\n***\n****\n*****\n'));
