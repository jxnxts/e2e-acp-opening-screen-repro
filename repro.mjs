import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentError } from 'e2e';
import { acp } from '@e2e-dev/acp';

const directory = mkdtempSync(join(tmpdir(), 'e2e-acp-opening-screen-'));
const logFile = join(directory, 'agent.jsonl');
const attemptController = new AbortController();
const attempt = { testId: 'probe', attemptId: 'probe-1', index: 0, signal: attemptController.signal, memory: new Map() };
const pass = { call: 'complete_step', args: { status: 'passed', summary: 'done' } };
const executor = acp({ command: process.execPath, args: [fileURLToPath(new URL('./scripted-agent.mjs', import.meta.url))], env: { ACP_LOG: logFile, ACP_SCRIPT: JSON.stringify([[pass], [pass]]) } });
const screen = { revision: '1', text: '#n1 button "Add"', truncated: false, viewport: { width: 800, height: 600 }, path: '/probe' };
function context(observe = async () => screen) {
  const controller = new AbortController();
  return { controller, ctx: {
    step: { kind: 'act', index: 0, instruction: 'Probe cancellation', secrets: [] },
    attempt, signal: controller.signal,
    target: { name: 'synthetic', platform: 'web', verbs: new Set(['tap']), tapModifiers: false },
    model: undefined, providerOptions: undefined, ledger: '', agentContext: undefined,
    actions: { tap: async () => undefined }, observe,
    attachTranscript() {}, attachTurns() {}, attachScreenshot: async () => 'screenshot',
    budgets: { maxActions: 25, maxModelCalls: 25, remainingMs: () => 60000, actionsUsed: () => 0, recordModelCall() {}, runTool: (_call, body) => body() },
  } };
}
let release;
let pending;
try {
  assert.equal((await executor.runStep(context().ctx)).status, 'passed');
  let entered;
  const reading = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const second = context(async () => { entered(); await held; return screen; });
  const reason = new AgentError('STEP_TIMEOUT', 'synthetic deadline while reading opening screen');
  pending = executor.runStep(second.ctx);
  const result = pending.then(value => ({ value }), error => ({ error }));
  await reading;
  second.controller.abort(reason);
  const outcome = await Promise.race([result, delay(1000).then(() => ({ pending: true }))]);
  console.log(`stoppedBeforeScreenRelease=${!outcome.pending} sameReason=${outcome.error === reason}`);
  assert.equal(outcome.error, reason, 'runStep must reject with its abort reason before the opening screen is released');
  assert.equal((await executor.runStep(context().ctx)).status, 'passed');
  release();
  await result;
  const entries = readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const sessions = entries.filter(entry => entry.session).length;
  const prompts = entries.filter(entry => entry.prompt).length;
  console.log(`sessions=${sessions} prompts=${prompts}`);
  assert.equal(sessions, 1);
  assert.equal(prompts, 2);
} finally {
  release?.();
  await pending?.catch(() => undefined);
  attemptController.abort();
  rmSync(directory, { recursive: true, force: true });
}
