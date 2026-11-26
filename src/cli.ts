#!/usr/bin/env node
import { readFileSync, readSync, writeSync } from 'node:fs';
import { ChiikawaError, Machine, encodeText, fromBrainfuck, parse } from './core.ts';
import type { MachineIO, MachineState } from './core.ts';

const USAGE = `chiikawa-lang: 치이카와 울음소리로 짜는 비공식 장난감 언어

사용법:
  chiikawa run <파일>        프로그램 실행 (chiikawa <파일>도 같음)
  chiikawa repl             한 줄씩 실행
  chiikawa encode [문장…]    문장을 출력하는 프로그램 만들기 (문장이 없으면 표준 입력)
  chiikawa from-bf <파일>    Brainfuck 프로그램 옮기기
  chiikawa help             이 도움말
`;

const errorCode = (e: unknown) => (e as NodeJS.ErrnoException)?.code;
const nap = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);

// 표준 입출력은 fd를 직접 동기로 읽고 쓴다. process.stdin을 건드리면 fd 0이
// 논블로킹이 되어 '하?'가 입력을 기다리지 못한다.
function writeAll(fd: number, bytes: Uint8Array): void {
  let at = 0;
  while (at < bytes.length) {
    try {
      at += writeSync(fd, bytes, at);
    } catch (e) {
      // 받는 쪽이 먼저 닫았으면(예: `| head`) 더 말할 곳이 없으니 조용히 끝낸다.
      if (errorCode(e) === 'EPIPE') process.exit(0);
      if (errorCode(e) !== 'EAGAIN') throw e;
      nap();
    }
  }
}

const print = (fd: number, text: string) => writeAll(fd, new TextEncoder().encode(text));

class Stdin {
  private buf = new Uint8Array(65536);
  private at = 0;
  private len = 0;
  private ended = false;
  /** 지금까지 읽어 간 바이트 수와 마지막으로 읽어 간 바이트. */
  count = 0;
  last: number | null = null;

  /** 다음 바이트. 입력이 끝났으면 null. */
  byte(): number | null {
    while (this.at >= this.len) {
      if (this.ended) return null;
      try {
        this.len = readSync(0, this.buf);
        this.at = 0;
        if (this.len === 0) this.ended = true;
      } catch (e) {
        if (errorCode(e) === 'EAGAIN') nap();
        else if (errorCode(e) === 'EOF') this.ended = true;
        else throw e;
      }
    }
    this.count++;
    return (this.last = this.buf[this.at++]);
  }

  /** 줄바꿈 전까지 한 줄. 더 읽을 게 없으면 null. */
  line(): string | null {
    const bytes: number[] = [];
    for (;;) {
      const b = this.byte();
      if (b === null) {
        if (bytes.length === 0) return null;
        break;
      }
      if (b === 10) break;
      bytes.push(b);
    }
    return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\r$/, '');
  }

  rest(): Uint8Array {
    const bytes: number[] = [];
    for (let b = this.byte(); b !== null; b = this.byte()) bytes.push(b);
    return new Uint8Array(bytes);
  }
}

/** 출력을 모았다가 줄바꿈이나 4096바이트마다, 그리고 입력을 읽기 직전에 내보낸다. */
class Stdout {
  private pending: number[] = [];
  last: number | null = null;

  put(byte: number): void {
    this.pending.push(byte);
    this.last = byte;
    if (byte === 10 || this.pending.length >= 4096) this.flush();
  }

  flush(): void {
    if (this.pending.length === 0) return;
    writeAll(1, new Uint8Array(this.pending));
    this.pending = [];
  }
}

function terminalIO(stdin: Stdin, stdout: Stdout): MachineIO {
  return {
    input: () => {
      stdout.flush();
      return stdin.byte();
    },
    output: (b) => stdout.put(b),
  };
}

function readSource(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new ChiikawaError(`파일을 읽을 수 없음: ${path}`);
  }
}

function runFile(path: string): void {
  const stdout = new Stdout();
  try {
    new Machine(parse(readSource(path)), terminalIO(new Stdin(), stdout)).run();
  } finally {
    stdout.flush();
  }
}

function repl(): void {
  const stdin = new Stdin();
  const stdout = new Stdout();
  const io = terminalIO(stdin, stdout);
  let state: MachineState | undefined;

  for (;;) {
    print(1, 'ㅊㅋ> ');
    const line = stdin.line();
    if (line === null) {
      print(1, '\n');
      return;
    }
    stdout.last = null;
    const readBefore = stdin.count;
    // '하?'가 입력 줄의 일부만 읽었으면 나머지는 버린다. 안 그러면 다음 코드 줄로 실행돼 버린다.
    const dropRestOfInputLine = () => {
      if (stdin.count !== readBefore && stdin.last !== 10) stdin.line();
    };
    try {
      const machine = new Machine(parse(line), io, state);
      state = machine; // 다음 줄이 테이프와 포인터를 이어받는다
      machine.run();
      stdout.flush();
      dropRestOfInputLine();
      if (stdout.last !== null && stdout.last !== 10) print(1, '\n');
      if (machine.halted) return;
      if (machine.pc > 0) print(1, `[${machine.ptr}번 칸 = ${machine.tape[machine.ptr]}]\n`);
    } catch (e) {
      stdout.flush();
      if (!(e instanceof ChiikawaError)) throw e;
      dropRestOfInputLine();
      if (stdout.last !== null && stdout.last !== 10) print(1, '\n');
      print(2, e.message + '\n');
    }
  }
}

function main(args: string[]): number {
  const [command, ...rest] = args;
  switch (command) {
    case undefined:
      print(2, USAGE);
      return 1;
    case 'help':
    case '--help':
    case '-h':
      print(1, USAGE);
      return 0;
    case 'repl':
      repl();
      return 0;
    case 'encode': {
      const text = rest.length ? rest.join(' ') : new TextDecoder().decode(new Stdin().rest());
      print(1, encodeText(text));
      return 0;
    }
    case 'from-bf':
    case 'run':
      if (rest.length === 0) {
        print(2, USAGE);
        return 1;
      }
      if (command === 'run') runFile(rest[0]);
      else print(1, fromBrainfuck(readSource(rest[0])));
      return 0;
    default:
      runFile(command);
      return 0;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof ChiikawaError)) throw e;
  print(2, e.message + '\n');
  process.exitCode = 1;
}
