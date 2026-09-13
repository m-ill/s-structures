import { createModel } from '../../../src/core/model.js';
import { installIndexEngineBridge } from '../../../src/ui/indexBridge.js';
import { createWebMcpTools } from '../../../src/ui/webmcp/tools.js';

export function designContext(overrides={}) {
  const model = createModel();
  model.meta = { projectId: 'P24-SYNTHETIC' };
  const target = { model: () => model, location: { search: '' },...overrides };
  const bridge = installIndexEngineBridge(target);
  const tools = createWebMcpTools({ agent: target.SStructuresAgent, bridge });
  return { model, bridge, tools, target,
    call(name, args = {}) {
      const tool = tools.find(row => row.name === name);
      if (!tool) throw Object.assign(new Error(name), { code: 'TOOL_NOT_FOUND' });
      return tool.execute(args);
    },
    async dispose() { tools.dispose(); await bridge.disposeRuntime(); },
  };
}
