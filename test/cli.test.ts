import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'chiikawa-'));
const file = (name: string, content: string) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
const cli = (args: string[], input = '') => {
  const r = spawnSync(process.execPath, ['src/cli.ts', ...args], { input });
  return { code: r.status, out: r.stdout, err: r.stderr.toString() };
};

const A = '야하하하하하하하하 라는 거?! 우라 야하하하하하하하하 후웅 싫어 어떻게든 돼라~! 우라 야하 와!';
const CAT = '하? 라는 거?! 와 하? 어떻게든 돼라';

test('run: 파일 실행', () => {
  const r = cli(['run', file('a.chiikawa', A)]);
  assert.equal(r.out.toString(), 'A');
  assert.equal(r.err, '');
  assert.equal(r.code, 0);
});

test('run 없이 파일 이름만 줘도 실행', () => {
  assert.equal(cli([file('a2.chiikawa', A)]).out.toString(), 'A');
});

test('run: 표준 입력을 바이트 단위로 읽는다', () => {
  assert.equal(cli(['run', file('cat.chiikawa', CAT)], '치이카와\n둘째 줄').out.toString(), '치이카와\n둘째 줄');
});

test('run: UTF-8이 아닌 바이트도 그대로 내보낸다', () => {
  assert.deepEqual([...cli(['run', file('ff.chiikawa', '싫어 와')]).out], [255]);
});

test('run: 문법 오류는 종료 코드 1', () => {
  const r = cli(['run', file('bad.chiikawa', '야하 와 냐옹')]);
  assert.equal(r.code, 1);
  assert.equal(r.err, '울어버렸다…! 1번째 줄 6번째 글자: 모르는 울음소리 "냐옹"\n');
  assert.equal(r.out.length, 0);
});

test('run: 실행 중 오류가 나도 그 전까지의 출력은 나온다', () => {
  const r = cli(['run', file('left.chiikawa', '야하하하하하하하하하하 와 후웅')]);
  assert.equal(r.code, 1);
  assert.equal(r.out.toString(), '\n');
  assert.match(r.err, /^울어버렸다…! .*테이프 밖으로/);
});

test('run: 없는 파일', () => {
  const r = cli(['run', join(dir, 'nope.chiikawa')]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^울어버렸다…! 파일을 읽을 수 없음: /);
});

test('encode: 인자를 코드로', () => {
  const code = cli(['encode', '안녕', '치이카와']).out.toString();
  assert.equal(cli(['run', file('enc.chiikawa', code)]).out.toString(), '안녕 치이카와');
});

test('encode: 인자가 없으면 표준 입력', () => {
  const code = cli(['encode'], 'hi\n').out.toString();
  assert.equal(cli(['run', file('enc2.chiikawa', code)]).out.toString(), 'hi\n');
});

test('from-bf', () => {
  assert.equal(cli(['from-bf', file('x.bf', '+++.')]).out.toString(), '야하하하 와\n');
});

test('repl: 줄마다 실행하고 상태를 이어 간다', () => {
  const r = cli(['repl'], '야하하\n야하\n냐옹\n우라\n');
  const out = r.out.toString();
  const at = ['[0번 칸 = 2]', '[0번 칸 = 3]', '[1번 칸 = 0]'].map((s) => out.indexOf(s));
  assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2], out);
  assert.match(r.err, /모르는 울음소리 "냐옹"/);
  assert.equal(r.code, 0);
});

test('repl: 출력 뒤에 줄을 바꾸고 상태를 보여 준다', () => {
  const r = cli(['repl'], A + '\n');
  assert.match(r.out.toString(), /A\n\[1번 칸 = 65\]\n/);
});

test('repl: 울어버렸다로 끝난다', () => {
  const r = cli(['repl'], '야하\n울어버렸다\n야하\n');
  assert.doesNotMatch(r.out.toString(), /= 2\]/);
  assert.equal(r.code, 0);
});

test('인자가 없으면 사용법', () => {
  const r = cli([]);
  assert.equal(r.code, 1);
  assert.match(r.err, /사용법/);
});

test('help', () => {
  const r = cli(['help']);
  assert.equal(r.code, 0);
  assert.match(r.out.toString(), /사용법/);
});
