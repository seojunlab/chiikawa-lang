# chiikawa-lang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 치이카와 울음소리로만 이루어진 Brainfuck 계열 esolang의 해석기, CLI, 한 파일짜리 웹 플레이그라운드를 만든다.

**Architecture:** 순수 모듈 `src/core.ts` 하나가 해석·실행·변환을 전부 맡고 다른 파일을 import하지 않는다. `src/cli.ts`는 동기 입출력으로 core를 감싸고, 빌드 스크립트는 컴파일된 core를 HTML 템플릿에 끼워 넣어 `docs/index.html`을 만든다.

**Tech Stack:** TypeScript(지울 수 있는 문법만), Node 22.18 이상(`.ts` 직접 실행), `node:test`, 개발 의존성 `typescript`·`@types/node`.

**Spec:** `docs/superpowers/specs/2026-11-26-chiikawa-lang-design.md`

## Global Constraints

- 런타임 의존성 0개. `src/core.ts`는 Node 전용 API를 쓰지 않는다(브라우저에서 그대로 돈다).
- 칸 30,000개, 한 칸 0~255(넘치면 돌아감), 포인터는 0번에서 시작, 입력 끝 = 0.
- 울음소리는 명세 표의 9개뿐. 그 밖의 글자는 오류. `#`부터 줄 끝까지 주석.
- 꾸밈 부호 `!` `~` `…` `.` `,` `♪`는 무시.
- 모든 오류 메시지는 `울어버렸다…! `로 시작한다.
- 원작 그림·로고 없음. README와 플레이그라운드에 비공식 팬 작품 문구.
- 파일 확장자 `.chiikawa`.

## Review Focus

1. 맥에서 복사한 자모 분리(NFD) 한글이나 BOM으로 시작하는 파일 → 정상 실행돼야 한다. (Task 1)
2. 윈도우 줄바꿈(CRLF)·탭 → 공백으로 취급하고 줄 번호가 맞아야 한다. (Task 1)
3. 전각 문장부호 `？` `！` `～` → 반각과 똑같이 받아야 한다. (Task 1)
4. UTF-8이 아닌 바이트 출력(예: 255) → 예외 없이 CLI는 바이트 그대로, `run()`은 대체 문자로. (Task 2, 4)
5. 한글 같은 여러 바이트 입력 → 바이트 단위로 들어와 그대로 다시 나가야 한다. (Task 2, 4)

---

### Task 1: 프로젝트 뼈대와 `parse`

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.gitignore`, `src/core.ts`
- Test: `test/parse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OpKind = 'add' | 'move' | 'out' | 'in' | 'open' | 'close' | 'halt';
  // add/move: n은 부호 있는 양. out/in: n은 반복 횟수. open/close: n은 짝의 인덱스. halt: 0
  export interface Op { kind: OpKind; n: number; line: number; col: number }
  export class ChiikawaError extends Error { line?: number; col?: number }
  export function parse(source: string): Op[];
  ```
- 설정: `package.json`은 `"type": "module"`, `"engines": {"node": ">=22.18"}`, `"bin": {"chiikawa": "dist/cli.js"}`, 스크립트 `test`(`node --test`), `typecheck`(`tsc --noEmit`), `build`(`tsc -p tsconfig.build.json && node scripts/build-playground.ts`). tsconfig는 `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`, `module: NodeNext`, `target: ES2022`. `.gitignore`는 `node_modules/`, `dist/`.

- [ ] **Step 1: 실패하는 테스트 작성** (`test/parse.test.ts`)

```ts
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
    assert.deepEqual(kinds(s), [['open', 1], ['close', 0]]);
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
```

- [ ] **Step 2: `node --test test/parse.test.ts` → 실패 확인** (모듈 없음)
- [ ] **Step 3: `parse` 구현.** 소스를 NFC로 정규화하고 맨 앞 BOM을 버린다. 위치마다 sticky 정규식 9개를 차례로 시도한다. 울음소리 바로 뒤는 공백·꾸밈 부호·`#`·끝 중 하나여야 하고, 아니면 다음 공백까지를 모르는 울음소리로 보고한다. 짝 맞추기는 스택으로(재귀 없음).
- [ ] **Step 4: 테스트 통과 확인**
- [ ] **Step 5: 커밋** `feat: parse chiikawa cries into ops`

### Task 2: `Machine`과 `run`

**Files:**
- Modify: `src/core.ts`
- Test: `test/machine.test.ts`

**Interfaces:**
- Consumes: `parse`, `Op`, `ChiikawaError`
- Produces:
  ```ts
  export const TAPE_SIZE = 30000;
  export interface MachineIO { input?: () => number | null; output?: (byte: number) => void }
  export interface MachineState { tape: Uint8Array; ptr: number }
  export class Machine {
    tape: Uint8Array; ptr: number; pc: number; halted: boolean;
    constructor(program: Op[], io?: MachineIO, state?: MachineState);
    run(budget?: number): 'done' | 'paused'; // 명령 budget개까지 실행. 기본은 끝까지
  }
  export function run(source: string, input?: string | Uint8Array): string; // 출력을 UTF-8로 해석
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const A = '야하하하하하하하하 라는 거?! 우라 야하하하하하하하하 후웅 싫어 어떻게든 돼라~! 우라 야하 와!';

test('A 출력', () => assert.equal(run(A), 'A'));
test('넘치면 돌아감', () => {
  const m = new Machine(parse('싫어')); m.run();
  assert.equal(m.tape[0], 255);
  const m2 = new Machine(parse('야' + '하'.repeat(257))); m2.run();
  assert.equal(m2.tape[0], 1);
});
test('입력을 그대로 출력 (한글 포함)', () => {
  const cat = '하? 라는 거?! 와 하? 어떻게든 돼라';
  assert.equal(run(cat, '치이카와 abc'), '치이카와 abc');
});
test('입력 끝은 0', () => {
  const m = new Machine(parse('야하 하?')); m.run();
  assert.equal(m.tape[0], 0);
});
test('울어버렸다는 즉시 종료', () => {
  const m = new Machine(parse('야하 울어버렸다 야하')); 
  assert.equal(m.run(), 'done');
  assert.equal(m.tape[0], 1); assert.equal(m.halted, true);
});
test('나눠서 실행', () => {
  const m = new Machine(parse('야하 야하 야하'));
  assert.equal(m.run(2), 'paused'); assert.equal(m.tape[0], 2);
  assert.equal(m.run(2), 'done'); assert.equal(m.tape[0], 3);
});
test('상태 이어받기', () => {
  const a = new Machine(parse('야하하 우라')); a.run();
  const b = new Machine(parse('후웅 야하'), {}, { tape: a.tape, ptr: a.ptr }); b.run();
  assert.equal(b.tape[0], 3);
});
test('테이프 밖', () => {
  assert.throws(() => run('후웅'), /울어버렸다…! 1번째 줄 1번째 글자: 테이프 밖으로 나가버렸다 \(-1번 칸\)/);
  assert.throws(() => run('우' + '라'.repeat(30000)), /테이프 밖으로 나가버렸다 \(30000번 칸\)/);
});
test('UTF-8이 아닌 출력은 대체 문자', () => assert.equal(run('싫어 와'), '�'));
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: `Machine`·`run` 구현.** `TextEncoder`/`TextDecoder`만 사용.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat: run programs on a 30,000-cell tape`

### Task 3: `fromBrainfuck`과 `encodeText`

**Files:**
- Modify: `src/core.ts`
- Test: `test/convert.test.ts`

**Interfaces:**
- Produces: `export function fromBrainfuck(bf: string): string;` `export function encodeText(text: string): string;`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
  assert.match(lines[1], /  # "H"$/); assert.match(lines[2], /  # "i"$/);
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현.** `fromBrainfuck`: 같은 명령의 연속을 늘여 말하기 하나로 접고, 반복은 줄을 바꿔 2칸 들여쓴다. `encodeText`: 1번 칸에 값을 두고 0번 칸을 곱셈용 카운터로 쓴다. 바이트마다 이전 값과의 차이 d(256으로 돌아가는 쪽 포함, 절댓값이 작은 쪽)를 구해, |d| ≤ 15면 바로 더하거나 빼고, 아니면 `후웅 야하×a 라는 거?! 우라 (야하|싫어)×b 후웅 싫어 어떻게든 돼라 우라 (야하|싫어)×|c| 와` 꼴로 a·b + c = |d|인 것 중 a + b + |c|가 가장 작은 조합(2 ≤ a ≤ 16)을 쓴다. 주석의 글자는 `JSON.stringify`로 감싼다.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat: convert Brainfuck and plain text to chiikawa`

### Task 4: CLI

**Files:**
- Create: `src/cli.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `parse`, `Machine`, `ChiikawaError`, `fromBrainfuck`, `encodeText`
- Produces: 명령 `chiikawa run <파일>`(`chiikawa <파일>`도 같음), `repl`, `encode [문장…]`(인자가 없으면 표준 입력), `from-bf <파일>`, `help`. 인자가 없으면 사용법을 표준 오류에 내고 종료 코드 1. `ChiikawaError`와 파일 읽기 실패는 메시지 한 줄을 표준 오류에 내고 종료 코드 1.
- REPL: 프롬프트 `ㅊㅋ> `, 줄마다 실행하고 테이프와 포인터를 이어 간다. 출력이 줄바꿈으로 끝나지 않으면 줄을 바꾸고 `[3번 칸 = 65]` 형태로 현재 칸을 보여 준다. 오류가 나도 계속한다. 입력 끝이나 `울어버렸다`에서 끝난다.

- [ ] **Step 1: 실패하는 테스트 작성.** `spawnSync(process.execPath, ['src/cli.ts', ...args], { input })`으로 검사:
  - `run`으로 임시 파일의 "A" 프로그램 → stdout `A`, 종료 코드 0. `run` 없이 파일 이름만 줘도 같다.
  - cat 프로그램에 `치이카와` 입력 → 그대로 출력.
  - `싫어 와` → stdout 바이트가 정확히 `[255]`.
  - `냐옹` 든 파일 → 종료 코드 1, stderr가 `울어버렸다…! `로 시작, stdout은 비어 있음.
  - 없는 파일 → 종료 코드 1, stderr가 `울어버렸다…! `로 시작.
  - `encode 안녕` 출력을 다시 `run` → `안녕`. `encode`에 인자 없이 stdin `hi` → 실행하면 `hi`.
  - `from-bf` 임시 파일 `+++.` → stdout `야하하하 와\n`.
  - `repl`에 stdin `야하하\n야하\n냐옹\n우라\n` → stdout에 `[0번 칸 = 2]`, `[0번 칸 = 3]`, `[1번 칸 = 0]`이 순서대로 있고 stderr에 `모르는 울음소리`가 있고 종료 코드 0.
  - 인자 없음 → 종료 코드 1, stderr에 `사용법`.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현.** 입출력은 `fs.readSync(0)`·`fs.writeSync(1)`만 쓴다(`process.stdin`을 건드리지 않음). 출력은 버퍼에 모았다가 줄바꿈, 4096바이트, 입력 읽기 직전, 종료 시 내보낸다. `EAGAIN`은 다시 시도하고 `EOF` 오류는 입력 끝으로 본다. 첫 줄은 `#!/usr/bin/env node`.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat: add chiikawa CLI with run, repl, encode and from-bf`

### Task 5: 예제

**Files:**
- Create: `examples/hello.chiikawa`, `examples/annyeong.chiikawa`, `examples/cat.chiikawa`, `examples/reverse.chiikawa`, `examples/countdown.chiikawa`, `examples/triangle.chiikawa`
- Test: `test/examples.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const ex = (name: string, input = '') => run(readFileSync(`examples/${name}.chiikawa`, 'utf8'), input);
test('hello', () => assert.equal(ex('hello'), 'Hello, World!\n'));
test('annyeong', () => assert.equal(ex('annyeong'), '안녕, 치이카와!\n'));
test('cat', () => assert.equal(ex('cat', '우라! 야하!'), '우라! 야하!'));
test('reverse', () => assert.equal(ex('reverse', 'abc'), 'cba'));
test('countdown', () => assert.equal(ex('countdown'), '9 8 7 6 5 4 3 2 1 0\n'));
test('triangle', () => assert.equal(ex('triangle'), '*\n**\n***\n****\n*****\n'));
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 예제 작성.** `hello`·`annyeong`은 `encodeText`로 만든 뒤 머리말 주석을 단다. 나머지 넷은 손으로 짜고 줄마다 `#` 주석으로 무슨 일을 하는지 적는다.
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `feat: add example programs`

### Task 6: 플레이그라운드

**Files:**
- Create: `playground/index.html`(템플릿), `scripts/build-playground.ts`, `docs/index.html`(빌드 결과, 커밋함), `docs/.nojekyll`

**Interfaces:**
- Consumes: `dist/core.js`(tsc 결과), `examples/*.chiikawa`
- 빌드: 템플릿의 `/*__CORE__*/` 자리에 `dist/core.js`에서 줄 맨 앞 `export `만 지운 코드를, `/*__EXAMPLES__*/` 자리에 `{이름: 소스}` JSON을 넣어 `docs/index.html`을 쓴다. 외부 요청이 없는 한 파일.
- 화면(한국어, 휴대폰 폭 우선): 코드 편집기, 실행·정지 버튼, 입력 칸, 출력, 테이프 보기(포인터 주변 칸과 현재 위치), 예제 고르기, 문장 → 코드 생성기, 울음소리 표, 비공식 팬 작품 문구. 실행은 프레임마다 정해진 걸음 수씩 나눠 돌려서 무한 반복 중에도 정지가 먹힌다. 오류는 출력 영역에 메시지로 보여 준다.

- [ ] **Step 1: 템플릿과 빌드 스크립트 작성, `npm run build`**
- [ ] **Step 2: Playwright로 확인.** `docs/index.html`을 `file://`로 열어 (a) 예제 hello 실행 → 출력 `Hello, World!`, (b) 생성기에 `안녕` → 실행하면 `안녕`, (c) `냐옹` 실행 → `울어버렸다…!` 메시지, (d) `야하 라는 거?! 어떻게든 돼라` 실행 후 정지 버튼으로 멈춤, (e) 콘솔 오류 0건, (f) 폭 390px에서 가로 스크롤 없음. 스크린샷으로 눈으로도 확인.
- [ ] **Step 3: 커밋** `feat: add single-file web playground`

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 작성.** 한 줄 소개, 비공식 팬 작품 문구, 맛보기 코드("A" 출력), 울음소리 표(명세와 같은 값), 규칙(구분·꾸밈 부호·주석·오류), 설치와 CLI 사용법(실제로 돌려 본 명령만), 플레이그라운드 여는 법, 예제 목록, 개발(테스트·빌드).
- [ ] **Step 2: README의 명령을 전부 실제로 실행해 출력이 적힌 대로인지 확인**
- [ ] **Step 3: 커밋** `docs: write README`
