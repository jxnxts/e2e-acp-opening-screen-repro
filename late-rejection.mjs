import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay, setImmediate } from 'node:timers/promises';
import { AgentError } from 'e2e';
import { acp } from '@e2e-dev/acp';
const directory = mkdtempSync(join(tmpdir(), 'acp-review-late-'));
const logFile = join(directory, 'agent.jsonl');
const attemptController = new AbortController();
const attempt = { testId: 'probe', attemptId: 'probe-1', index: 0, titlePath: [], signal: attemptController.signal, memory: new Map() };
const executor = acp({ command: process.execPath, args: [fileURLToPath(new URL('./delayed-agent.mjs', import.meta.url))], env: { ACP_LOG: logFile, ACP_RELEASE: join(directory, 'release') } });
const screen = { revision: '1', text: '#n1 button "Add"', truncated: false, viewport: { width: 800, height: 600 }, path: '/probe' };
let observeCount = 0;
function context() {
  const controller = new AbortController();
  return { controller, ctx: {
    step: { kind: 'act', index: 0, instruction: 'Probe cancellation', params: undefined, secrets: [] },
    attempt, signal: controller.signal,
    target: { name: 'synthetic', platform: 'web', verbs: new Set(['tap']), tapModifiers: false },
    model: undefined, providerOptions: undefined, ledger: '', agentContext: undefined,
    actions: { tap: async () => undefined },
    observe: async () => { observeCount++; controller.signal.throwIfAborted(); return screen; },
    attachTranscript() {}, attachTurns() {}, attachScreenshot: async () => 'screenshot',
    budgets: { maxActions: 25, maxModelCalls: 25, remainingMs: () => 60000, actionsUsed: () => 0, recordModelCall() {}, runTool: (_call, body) => body() },
  } };
}
const unhandled = [];
const onUnhandled = reason => { unhandled.push(reason); console.log('UNHANDLED', reason.code, reason.message); };
if (!process.argv.includes('--fatal')) process.on('unhandledRejection', onUnhandled);
try {
  const first = context();
  const firstResult = executor.runStep(first.ctx).catch(error => error);
  for (let i = 0; ; i++) {
    let entries = '';
    try { entries = readFileSync(logFile, 'utf8'); } catch {}
    if (entries.includes('"prompt"')) break;
    assert.ok(i < 200, 'agent did not receive its prompt');
    await delay(10);
  }
  first.controller.abort(new AgentError('STEP_TIMEOUT', 'first aborted'));
  assert.equal((await firstResult).code, 'STEP_TIMEOUT');
  const second = context();
  const secondResult = executor.runStep(second.ctx).catch(error => error);
  await setImmediate();
  const reason = new AgentError('STEP_TIMEOUT', 'second aborted during previous-turn wait');
  second.controller.abort(reason);
  writeFileSync(join(directory, 'release'), '');
  assert.equal(await secondResult, reason);
  await delay(50);
  assert.equal(unhandled.length, 0);
  console.log(JSON.stringify({ build: 'package', observeCount, unhandled: unhandled.length, sameUnhandledReason: unhandled[0] === reason }));
} finally {
  attemptController.abort();
  await delay(50);
  rmSync(directory, { recursive: true, force: true });
  process.removeListener('unhandledRejection', onUnhandled);
}
