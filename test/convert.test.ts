import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, fromBrainfuck, encodeText } from '../src/core.ts';

test('Brainfuck 변환', () => {
  assert.equal(fromBrainfuck('++>-<.,'), '야하하 우라 싫어 후웅 와 하?\n');
  assert.equal(fromBrainfuck('+[-]hello'), '야하\n라는 거?!\n  싫어\n어떻게든 돼라\n');
  assert.equal(fromBrainfuck(''), '');
  const hello = '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.';
  assert.equal(run(fromBrainfuck(hello)), 'Hello World!\n');
});

test('문장 → 코드 왕복', () => {
  for (const t of ['A', 'Hello, World!\n', '안녕, 치이카와!', '😭 # "따옴표"\n둘째 줄', '\u0000\u007f'])
    assert.equal(run(encodeText(t)), t);
  assert.equal(encodeText(''), '');
});

test('생성된 울음소리는 20글자를 넘지 않는다', () => {
  for (const word of encodeText('Hello, 치이카와!').replace(/#.*$/gm, '').split(/\s+/))
    assert.ok(word.length <= 20, word);
});

test('글자마다 한 줄, 주석으로 글자 표시', () => {
  const lines = encodeText('Hi').trimEnd().split('\n');
  assert.equal(lines.length, 3); // 첫 줄은 "우라", 그 뒤 글자당 한 줄
  assert.match(lines[1], /  # "H"$/);
  assert.match(lines[2], /  # "i"$/);
});
