// Run with: node --test tests/staff-preview.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Load the actual TypeScript timing functions without adding a test dependency.
function loadTs(filename) {
  const source = readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const localRequire = (specifier) => loadTs(path.resolve(path.dirname(filename), `${specifier}.ts`));
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}

const { isAttendeeBingoAccessible, isAttendeeBingoOpen } = loadTs(
  path.resolve(__dirname, '../src/config/appTiming.ts'),
);
const beforeLaunch = new Date('2026-09-29T12:59:59Z');

test('ordinary visitors remain locked before 6 AM Pacific', () => {
  assert.equal(isAttendeeBingoAccessible(beforeLaunch), false);
  assert.equal(isAttendeeBingoAccessible(beforeLaunch, false), false);
});

test('verified admins can preview before launch without an email argument', () => {
  assert.equal(isAttendeeBingoAccessible(beforeLaunch, true), true);
  assert.equal(isAttendeeBingoOpen(beforeLaunch), false);
});

test('public access opens at the unchanged September 29, 6 AM Pacific boundary', () => {
  assert.equal(isAttendeeBingoAccessible(new Date('2026-09-29T13:00:00Z'), false), true);
  assert.equal(isAttendeeBingoAccessible(new Date('2026-09-30T13:00:00Z'), false), true);
});
