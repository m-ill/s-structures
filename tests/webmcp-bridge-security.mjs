import assert from 'node:assert/strict';
import { installIndexAgentCommandBridge, AGENT_COMMAND_MESSAGE_TYPE, AGENT_RESPONSE_MESSAGE_TYPE } from '../src/ui/indexAgentCommandBridge.js';
import { createModelerBridge } from '../src/app/modelerBridge.js';
const listeners = {};
let mutations = 0;
const parent = { postMessage() {} };
const target = {
  parent,
  location: { origin: 'https://s.example', pathname: '/index.html', hash: '#sscmd='+encodeURIComponent(JSON.stringify({ action: 'setModel' })) },
  history: { replaceState() { target.location.hash = ''; } },
  addEventListener(type, fn) { listeners[type] = fn; },
};
installIndexAgentCommandBridge(target, { execute() { mutations++; return {}; }, getCapabilities() { return {}; } });
assert.equal(mutations, 0, 'initial hash must not mutate');
const data = { type: AGENT_COMMAND_MESSAGE_TYPE, command: { method: 'execute', action: 'setModel' } };
for (const event of [{ origin: 'https://evil.example', source: parent }, { origin: 'https://s.example', source: {} }, { origin: 'null', source: parent }, { origin: 'https://s.example', source: null }]) listeners.message({ ...event, data });
assert.equal(mutations, 0, 'forged messages must not execute');
listeners.message({ origin: 'https://s.example', source: parent, data });
assert.equal(mutations, 1, 'same-origin actual parent works');
target.location.hash = '#sscmd='+encodeURIComponent(JSON.stringify({ action: 'setModel' }));
listeners.hashchange();
assert.equal(mutations, 1, 'hash changes must not mutate');

let receive, posted;
const frame = { postMessage(data, origin) { posted = { data, origin }; } };
const win = { location: { href: 'https://s.example/app.html', origin: 'https://s.example' }, addEventListener(_type, fn) { receive = fn; }, removeEventListener() {}, setTimeout, clearTimeout };
const shell = createModelerBridge({ window: win, iframe: { src: 'https://s.example/index.html', contentWindow: frame } });
let settled = false;
const request = shell.request('getModel', {}, { id: 'one' }).then((data) => { settled = true; return data; });
assert.equal(posted.origin, 'https://s.example');
await assert.rejects(shell.request('getModel', {}, { id: 'one' }), /Duplicate/);
const response = { type: AGENT_RESPONSE_MESSAGE_TYPE, response: { id: 'one', ok: true, data: { accepted: true } } };
receive({ data: response, origin: 'https://evil.example', source: frame });
receive({ data: response, origin: 'https://s.example', source: {} });
await Promise.resolve();
assert.equal(settled, false);
receive({ data: response, origin: 'https://s.example', source: frame });
assert.deepEqual(await request, { accepted: true });
shell.dispose();
await assert.rejects(shell.getModel(), /disposed/);
const foreign = createModelerBridge({ window: win, iframe: { src: 'https://evil.example/index.html', contentWindow: frame } });
await assert.rejects(foreign.getModel(), /same-origin/);
console.log(JSON.stringify({ ok: true, originGuard: true, sourceGuard: true, hashMutationBlocked: true, forgedResponseBlocked: true, exactTargetOrigin: true }));
