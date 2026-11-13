# ACP opening-screen cancellation reproduction

Synthetic public-API probe for `@e2e-dev/acp@0.1.2`, with a scripted local ACP agent. No browser, model account, or network service is needed at runtime.

Use Node 24.22.2 (or a supported Node release). Install with `npm ci --ignore-scripts --no-audit --no-fund` and run `npm test`. The affected package exits 1 because its `runStep` promise remains pending after abort while an observation is held. Cleanup releases the held observation and ends the attempt in `finally`.

After installing a corrected ACP package tarball with `npm install --ignore-scripts --no-audit --no-fund --no-save /path/to/e2e-dev-acp-0.1.2.tgz`, `npm test` exits 0 and prints:

```text
stoppedBeforeScreenRelease=true sameReason=true
sessions=1 prompts=2
```

The synthetic observation is intentionally delayed. The assertion concerns the public executor's cancellation contract, not the runner's separately enforced outer step deadline or a real model's behavior.

The additional `late-rejection.mjs` regression holds the first prompt turn until a file barrier is released, cancels the second step during that wait, and lets its observation throw on an aborted signal. `npm test` runs both probes; `npm run test:late` runs this second probe with no unhandled-rejection listener and the default Node policy. It verifies that an already-aborted step does not leave an observation rejection unhandled after the previous turn ends. This is a regression check for the fix, not a second bug reported against the published package.

## License and provenance

Apache-2.0, with the upstream license and notice retained in `LICENSE` and `NOTICE`. The scripted agents adapt the ACP/MCP setup from [e2e’s test fixture](https://github.com/e2e-inc/e2e/blob/e167149af1d390492af09e5fe28bb64072e9df64/packages/acp/tests/fixtures/scripted-agent.ts) for these synthetic cancellation probes. The reproduction code modifies that setup; it is not an upstream e2e package.
