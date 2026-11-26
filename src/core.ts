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
  const src = source.normalize('NFC').replace(/^﻿/, '');
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
