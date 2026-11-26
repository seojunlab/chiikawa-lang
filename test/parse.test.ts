import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, ChiikawaError } from '../src/core.ts';

const kinds = (s: string) => parse(s).map((o) => [o.kind, o.n]);

test('울음소리 9개', () => {
  assert.deepEqual(kinds('야하 싫어 우라 후웅 와 하? 울어버렸다'),
    [['add', 1], ['add', -1], ['move', 1], ['move', -1], ['out', 1], ['in', 1], ['halt', 0]]);
  assert.deepEqual(kinds('라는 거?! 어떻게든 돼라'), [['open', 1], ['close', 0]]);
});

test('늘여 말하기', () => {
  assert.deepEqual(kinds('야하하하 싫어어어 우라라라 후우우웅 와아아 하아아?'),
    [['add', 3], ['add', -3], ['move', 3], ['move', -3], ['out', 3], ['in', 3]]);
});

test('표기 변형', () => {
  for (const s of ['라는거?! 어떻게든돼라', '라는 거!? 어떻게든 되어라', '라는 거？！ 어떻게든 돼라～！'])
    assert.deepEqual(kinds(s), [['open', 1], ['close', 0]], s);
});

test('꾸밈 부호와 주석', () => {
  assert.deepEqual(kinds('야하하! 우라~♪ 와…  # 치이카와 최고\n싫어, 싫어.'),
    [['add', 2], ['move', 1], ['out', 1], ['add', -1], ['add', -1]]);
});

test('중첩 반복의 짝', () => {
  assert.deepEqual(kinds('라는 거?! 라는 거?! 어떻게든 돼라 어떻게든 돼라'),
    [['open', 3], ['open', 2], ['close', 1], ['close', 0]]);
});

test('위치는 1부터', () => {
  const [a, b] = parse('야하\r\n\t우라');
  assert.deepEqual([a.line, a.col, b.line, b.col], [1, 1, 2, 2]);
});

test('BOM과 자모 분리 한글', () => {
  assert.deepEqual(kinds('﻿' + '야하 우라'.normalize('NFD')), [['add', 1], ['move', 1]]);
});

test('오류', () => {
  assert.throws(() => parse('야하\n  냐옹 와'), (e: ChiikawaError) =>
    e instanceof ChiikawaError && e.line === 2 && e.col === 3 &&
    e.message === '울어버렸다…! 2번째 줄 3번째 글자: 모르는 울음소리 "냐옹"');
  assert.throws(() => parse('우라라는 거?!'), /모르는 울음소리 "우라라는"/);
  assert.throws(() => parse('야하?'), /모르는 울음소리 "야하\?"/);
  assert.throws(() => parse('어떻게든 돼라'), /1번째 줄 1번째 글자: 짝이 없는 "어떻게든 돼라"/);
  assert.throws(() => parse('야하 라는 거?!'), /1번째 줄 4번째 글자: "라는 거\?!"를 닫는 "어떻게든 돼라"가 없음/);
});

test('빈 프로그램', () => assert.deepEqual(parse('  \n# 주석뿐\n'), []));
