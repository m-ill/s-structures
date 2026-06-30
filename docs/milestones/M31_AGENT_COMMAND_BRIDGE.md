# M31 Agent Command Bridge

## Purpose

M31 adds a DOM-event API so browser automation and AI agents can control the original `index.html` UI without relying only on pixel clicks or direct page-global access.

## Public Contract

- Command event: `sstructures:agent-command`
- Response event: `sstructures:agent-response`
- Command message type: `sstructures:agent-command`
- Response message type: `sstructures:agent-response`
- URL hash command key: `#sstructures-command=...`
- Response node: `#sstructuresAgentApi`
- Stable control id: `data-agent-id="agent-api-command-bridge"`

## Command Shape

```js
document.dispatchEvent(new CustomEvent('sstructures:agent-command', {
  detail: {
    id: 'cmd-1',
    method: 'execute',
    action: 'nativeAddColumn',
    payload: { base: [0, 0, 0], height: 3, support: 'fixed' }
  }
}));
```

Read the latest response from:

```js
JSON.parse(document.getElementById('sstructuresAgentApi').textContent)
```

For browser automation that only needs the next control value, read the compact summary:

```js
JSON.parse(document.getElementById('sstructuresAgentApi').getAttribute('data-response-summary'))
```

Browser automation can use `postMessage` when direct page-global event constructors are unavailable:

```js
window.postMessage({
  type: 'sstructures:agent-command',
  id: 'cmd-2',
  method: 'execute',
  action: 'nativeAddUdl',
  payload: { memberId: 'MBRIDGE', w: 6, dir: '-z', case: 'D' }
}, '*');
```

The response is still written to `#sstructuresAgentApi`, and a response message is posted with `type: 'sstructures:agent-response'`.

If the automation surface cannot run page scripts, change the URL hash instead:

```js
const command = {
  id: 'cmd-3',
  method: 'runAnalysis'
};
location.hash = `sstructures-command=${encodeURIComponent(JSON.stringify(command))}`;
```

This also writes the latest response to `#sstructuresAgentApi` and the compact response to `data-response-summary`.
After a hash command is processed, the bridge clears the hash with `history.replaceState` so a later reload does not replay the same command.

## Supported Methods

- `getSnapshot`
- `getScreenState`
- `getCapabilities`
- `getModel`
- `getResults`
- `getResultView`
- `getResultVisuals`
- `getReport`
- `getRuntimeDiagnostics`
- `execute`
- `runAnalysis`
- `runPushover`

For `execute`, pass the existing agent action name in `action`, such as `nativeAddColumn`, `nativeDrawMember`, `nativeAddUdl`, `setNativeMode`, `setNativeResultToggle`, or `runNativeProductAudit`.

## Validation

`tests/m31-agent-command-bridge.mjs` verifies that DOM commands, `postMessage` commands, and URL hash commands can clear the page, create a two-column frame, add a beam, apply a distributed load, run analysis, read screen state, read capabilities, and report errors for unsupported commands.
