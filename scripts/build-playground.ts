// playground/index.html 템플릿에 컴파일된 core와 예제를 끼워 넣어 docs/index.html을 만든다.
// 먼저 `tsc -p tsconfig.build.json`으로 dist/core.js가 만들어져 있어야 한다.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

// core는 아무것도 import하지 않으므로 export만 지우면 일반 스크립트로 쓸 수 있다.
const core = read('dist/core.js').replace(/^export /gm, '');
if (/^(import|export)\b/m.test(core)) throw new Error('dist/core.js에 지우지 못한 import/export가 남아 있음');

const examples: Record<string, string> = {};
for (const file of readdirSync(new URL('examples/', root)).sort()) {
  if (file.endsWith('.chiikawa')) examples[file.replace(/\.chiikawa$/, '')] = read(`examples/${file}`);
}
// HTML 안의 <script>에 들어가므로 "<"는 이스케이프한다.
const examplesJson = JSON.stringify(examples).replace(/</g, '\\u003c');

const template = read('playground/index.html');
for (const slot of ['/*__CORE__*/', '/*__EXAMPLES__*/{}']) {
  if (template.split(slot).length !== 2) throw new Error(`템플릿에 ${slot} 자리가 정확히 하나 있어야 함`);
}
const html = template
  .replace('/*__CORE__*/', () => core)
  .replace('/*__EXAMPLES__*/{}', () => examplesJson);

mkdirSync(new URL('docs/', root), { recursive: true });
writeFileSync(new URL('docs/index.html', root), html);
console.log(`docs/index.html (${html.length.toLocaleString('en-US')}자)`);
