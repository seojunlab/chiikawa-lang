// chiikawa-lang 해석기. 브라우저에서도 그대로 돌아야 하므로 아무것도 import하지 않는다.

export type OpKind = 'add' | 'move' | 'out' | 'in' | 'open' | 'close' | 'halt';

/**
 * add/move: n은 부호 있는 양. out/in: n은 반복 횟수.
 * open/close: n은 짝이 되는 명령의 인덱스. halt: 0.
 */
export interface Op {
  kind: OpKind;
  n: number;
  line: number;
  col: number;
}

export class ChiikawaError extends Error {
  line?: number;
  col?: number;

  constructor(detail: string, line?: number, col?: number) {
    const where = line === undefined ? '' : `${line}번째 줄 ${col}번째 글자: `;
    super(`울어버렸다…! ${where}${detail}`);
    this.name = 'ChiikawaError';
    this.line = line;
    this.col = col;
  }
}

// 울음소리 뒤에 붙여도 되는 꾸밈 부호. 전각 문자도 받는다.
const DECORATION = '!~….,♪！～〜';

// [정규식, 종류, 한 번 늘일 때마다 더해지는 양]. 늘인 부분은 첫 번째 그룹에 잡힌다.
const CRIES: [RegExp, OpKind, number][] = [
  [/야하(하*)/y, 'add', 1],
  [/싫어(어*)/y, 'add', -1],
  [/우라(라*)/y, 'move', 1],
  [/후(우*)웅/y, 'move', -1],
  [/와(아*)/y, 'out', 1],
  [/하(아*)[?？]/y, 'in', 1],
  [/라는 ?거[!！]?[?？]/y, 'open', 0],
  [/어떻게든 ?(?:돼라|되어라)/y, 'close', 0],
  [/울어버렸다/y, 'halt', 0],
];

const isSpace = (ch: string) => /\s/.test(ch);
const isBoundary = (ch: string | undefined) =>
  ch === undefined || ch === '#' || isSpace(ch) || DECORATION.includes(ch);

export function parse(source: string): Op[] {
  const src = source.normalize('NFC').replace(/^\uFEFF/, '');
  const ops: Op[] = [];
  const opens: number[] = [];
  let line = 1;
  let lineStart = 0;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') {
      line++;
      lineStart = ++i;
      continue;
    }
    if (isSpace(ch) || DECORATION.includes(ch)) {
      i++;
      continue;
    }
    if (ch === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    const col = i - lineStart + 1;
    let matched = false;
    for (const [re, kind, unit] of CRIES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m || !isBoundary(src[i + m[0].length])) continue;

      const n = unit * (1 + (m[1]?.length ?? 0));
      if (kind === 'open') {
        opens.push(ops.length);
        ops.push({ kind, n: -1, line, col });
      } else if (kind === 'close') {
        const open = opens.pop();
        if (open === undefined) throw new ChiikawaError('짝이 없는 "어떻게든 돼라"', line, col);
        ops[open].n = ops.length;
        ops.push({ kind, n: open, line, col });
      } else {
        ops.push({ kind, n, line, col });
      }
      i += m[0].length;
      matched = true;
      break;
    }

    if (!matched) {
      let end = i;
      while (end < src.length && !isSpace(src[end]) && src[end] !== '#') end++;
      const word = src.slice(i, end);
      const shown = word.length > 20 ? word.slice(0, 20) + '…' : word;
      throw new ChiikawaError(`모르는 울음소리 "${shown}"`, line, col);
    }
  }

  const unclosed = opens.pop();
  if (unclosed !== undefined) {
    const { line: l, col: c } = ops[unclosed];
    throw new ChiikawaError('"라는 거?!"를 닫는 "어떻게든 돼라"가 없음', l, c);
  }
  return ops;
}

export const TAPE_SIZE = 30000;

export interface MachineIO {
  /** 다음 입력 바이트. 입력이 끝났으면 null. */
  input?: () => number | null;
  output?: (byte: number) => void;
}

export interface MachineState {
  tape: Uint8Array;
  ptr: number;
}

export class Machine {
  tape: Uint8Array;
  ptr: number;
  pc = 0;
  halted = false;
  private program: Op[];
  private io: MachineIO;

  constructor(program: Op[], io: MachineIO = {}, state?: MachineState) {
    this.program = program;
    this.io = io;
    this.tape = state?.tape ?? new Uint8Array(TAPE_SIZE);
    this.ptr = state?.ptr ?? 0;
  }

  /** 명령을 budget개까지 실행한다. 다 못 끝냈으면 'paused'를 돌려주고, 다시 부르면 이어서 한다. */
  run(budget = Infinity): 'done' | 'paused' {
    const { program, tape, io } = this;
    while (!this.halted && this.pc < program.length) {
      if (budget-- <= 0) return 'paused';
      const op = program[this.pc];
      switch (op.kind) {
        case 'add':
          tape[this.ptr] += op.n; // Uint8Array라서 0~255로 돌아간다
          break;
        case 'move': {
          const to = this.ptr + op.n;
          if (to < 0 || to >= tape.length) {
            throw new ChiikawaError(`테이프 밖으로 나가버렸다 (${to}번 칸)`, op.line, op.col);
          }
          this.ptr = to;
          break;
        }
        case 'out':
          for (let k = 0; k < op.n; k++) io.output?.(tape[this.ptr]);
          break;
        case 'in':
          for (let k = 0; k < op.n; k++) tape[this.ptr] = io.input?.() ?? 0;
          break;
        case 'open':
          if (tape[this.ptr] === 0) this.pc = op.n;
          break;
        case 'close':
          if (tape[this.ptr] !== 0) this.pc = op.n;
          break;
        case 'halt':
          this.halted = true;
          break;
      }
      this.pc++;
    }
    return 'done';
  }
}

/** 프로그램을 끝까지 돌리고 출력을 UTF-8로 해석해 돌려준다. */
export function run(source: string, input: string | Uint8Array = ''): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let at = 0;
  const out: number[] = [];
  new Machine(parse(source), {
    input: () => (at < bytes.length ? bytes[at++] : null),
    output: (b) => out.push(b),
  }).run();
  return new TextDecoder().decode(new Uint8Array(out));
}

type BfChar = '+' | '-' | '>' | '<' | '.' | ',';

/** n번 늘여 말한 울음소리 하나. */
function cry(bf: BfChar, n: number): string {
  switch (bf) {
    case '+': return '야' + '하'.repeat(n);
    case '-': return '싫' + '어'.repeat(n);
    case '>': return '우' + '라'.repeat(n);
    case '<': return '후' + '우'.repeat(n - 1) + '웅';
    case '.': return '와' + '아'.repeat(n - 1);
    case ',': return '하' + '아'.repeat(n - 1) + '?';
  }
}

/** Brainfuck 프로그램을 chiikawa-lang으로 옮긴다. 명령이 아닌 글자는 버린다. */
export function fromBrainfuck(bf: string): string {
  const lines: string[] = [];
  let words: string[] = [];
  let depth = 0;
  const flush = () => {
    if (words.length) lines.push('  '.repeat(depth) + words.join(' '));
    words = [];
  };

  const code = bf.replace(/[^-+<>.,[\]]/g, '');
  for (let i = 0; i < code.length; ) {
    const ch = code[i];
    if (ch === '[') {
      flush();
      lines.push('  '.repeat(depth++) + '라는 거?!');
      i++;
    } else if (ch === ']') {
      flush();
      depth = Math.max(0, depth - 1);
      lines.push('  '.repeat(depth) + '어떻게든 돼라');
      i++;
    } else {
      let n = 1;
      while (code[i + n] === ch) n++;
      words.push(cry(ch as BfChar, n));
      i += n;
    }
  }
  flush();
  return lines.map((l) => l + '\n').join('');
}

/** 현재 칸(1번)의 값을 d만큼 바꾸는 울음소리들. 큰 차이는 0번 칸을 카운터로 쓴 곱셈으로 만든다. */
function changeBy(d: number): string[] {
  const size = Math.abs(d);
  const up: BfChar = d > 0 ? '+' : '-';
  const down: BfChar = d > 0 ? '-' : '+';
  if (size === 0) return [];
  if (size <= 15) return [cry(up, size)];

  let best = { a: 0, b: 0, c: 0, cost: Infinity };
  for (let a = 2; a <= 16; a++) {
    for (const b of [Math.floor(size / a), Math.ceil(size / a)]) {
      const c = size - a * b;
      const cost = a + b + Math.abs(c);
      if (cost < best.cost) best = { a, b, c, cost };
    }
  }
  const { a, b, c } = best;
  const words = ['후웅', cry('+', a), '라는 거?!', '우라', cry(up, b), '후웅', '싫어', '어떻게든 돼라', '우라'];
  if (c !== 0) words.push(cry(c > 0 ? up : down, Math.abs(c)));
  return words;
}

/** 실행하면 text를 그대로 출력하는 프로그램을 만든다. 글자마다 한 줄. */
export function encodeText(text: string): string {
  if (text === '') return '';
  const encoder = new TextEncoder();
  const lines = ['우라'];
  let value = 0;
  for (const ch of text) {
    const words: string[] = [];
    for (const byte of encoder.encode(ch)) {
      const d = ((byte - value + 128 + 256) % 256) - 128; // 돌아가는 쪽까지 쳐서 가까운 방향
      words.push(...changeBy(d), '와');
      value = byte;
    }
    lines.push(`${words.join(' ')}  # ${JSON.stringify(ch)}`);
  }
  return lines.map((l) => l + '\n').join('');
}
