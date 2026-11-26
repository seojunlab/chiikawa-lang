import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, run, Machine } from '../src/core.ts';

const A = '야하하하하하하하하 라는 거?! 우라 야하하하하하하하하 후웅 싫어 어떻게든 돼라~! 우라 야하 와!';

test('A 출력', () => assert.equal(run(A), 'A'));

test('넘치면 돌아감', () => {
  const m = new Machine(parse('싫어'));
  m.run();
  assert.equal(m.tape[0], 255);
  const m2 = new Machine(parse('야' + '하'.repeat(257)));
  m2.run();
  assert.equal(m2.tape[0], 1);
});

test('입력을 그대로 출력 (한글 포함)', () => {
  const cat = '하? 라는 거?! 와 하? 어떻게든 돼라';
  assert.equal(run(cat, '치이카와 abc'), '치이카와 abc');
});

test('입력 끝은 0', () => {
  const m = new Machine(parse('야하 하?'));
  m.run();
  assert.equal(m.tape[0], 0);
});

test('울어버렸다는 즉시 종료', () => {
  const m = new Machine(parse('야하 울어버렸다 야하'));
  assert.equal(m.run(), 'done');
  assert.equal(m.tape[0], 1);
  assert.equal(m.halted, true);
});

test('나눠서 실행', () => {
  const m = new Machine(parse('야하 야하 야하'));
  assert.equal(m.run(2), 'paused');
  assert.equal(m.tape[0], 2);
  assert.equal(m.run(2), 'done');
  assert.equal(m.tape[0], 3);
});

test('상태 이어받기', () => {
  const a = new Machine(parse('야하하 우라'));
  a.run();
  const b = new Machine(parse('후웅 야하'), {}, { tape: a.tape, ptr: a.ptr });
  b.run();
  assert.equal(b.tape[0], 3);
});

test('테이프 밖', () => {
  assert.throws(() => run('후웅'), /울어버렸다…! 1번째 줄 1번째 글자: 테이프 밖으로 나가버렸다 \(-1번 칸\)/);
  assert.throws(() => run('우' + '라'.repeat(30000)), /테이프 밖으로 나가버렸다 \(30000번 칸\)/);
});

test('UTF-8이 아닌 출력은 대체 문자', () => assert.equal(run('싫어 와'), '�'));
