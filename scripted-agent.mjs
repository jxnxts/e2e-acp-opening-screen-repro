import { appendFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { agent, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk/unstable';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// Synthetic agent: every prompt calls the harness verdict tool and ends.
const log = entry => appendFileSync(process.env.ACP_LOG, `${JSON.stringify(entry)}\n`);
let mcp;
log({ pid: process.pid });
agent()
  .onRequest(methods.agent.initialize, () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: { mcpCapabilities: { http: true }, sessionCapabilities: { close: {} } },
    agentInfo: { name: 'synthetic-verdict-agent', version: '1' },
    authMethods: [],
  }))
  .onRequest(methods.agent.session.new, async ({ params }) => {
    mcp = new Client({ name: 'synthetic-verdict-agent', version: '1' });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(params.mcpServers[0].url)));
    await mcp.listTools();
    log({ session: { cwd: params.cwd, server: params.mcpServers[0].name } });
    return { sessionId: 'synthetic-1' };
  })
  .onRequest(methods.agent.session.prompt, async ({ params }) => {
    log({ prompt: params.prompt });
    await mcp.callTool({ name: 'complete_step', arguments: { status: 'passed', summary: 'synthetic goal complete' } });
    return { stopReason: 'end_turn' };
  })
  .onNotification(methods.agent.session.cancel, () => {})
  .onRequest(methods.agent.session.close, () => ({}))
  .connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
