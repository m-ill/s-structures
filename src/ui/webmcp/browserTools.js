import { browserDefinitions } from './browserDefinitions.js';
import { finiteJson } from '../../modeling/designInputCommands.js';

// A fixed discovery surface avoids growing the browser registration for every
// new design module. Canonical tool names, validation and execution stay intact.
export const BROWSER_TOOL_NAMES = Object.freeze([
  'list_sstructures_tools', 'describe_sstructures_tool',
  'read_sstructures_tool', 'execute_sstructures_tool',
]);
export const BROWSER_DESCRIPTOR_BUDGET = 24 * 1024;
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const name = { type: 'string', minLength: 1, maxLength: 128 };
const input = object({ name, arguments: { type: 'object', additionalProperties: true } }, ['name', 'arguments']);
const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID_INPUT' }); };

export function browserDescriptorBytes(definitions, href = 'https://m-ill.github.io/s-structures/') {
  const url = new URL(href);
  return new TextEncoder().encode(JSON.stringify(definitions.map(({ execute, ...definition }) => ({
    ...definition, origin: url.origin, pageUrl: url.href,
  })))).byteLength;
}

export function createBrowserTools(definitions, { onDiscovery = () => {} } = {}) {
  const catalog = browserDefinitions(definitions);
  const byName = new Map(catalog.map(tool => [tool.name, tool]));
  if (byName.size !== catalog.length) throw new Error('Duplicate WebMCP tool name');
  const lookup = value => {
    const tool = byName.get(value);
    if (!tool) fail('Unknown tool. Use list_sstructures_tools first.');
    return tool;
  };
  const wrap = (name, description, inputSchema, readOnly, run) => ({
    name, description, inputSchema, annotations: { readOnlyHint: readOnly },
    execute(args = {}) {
      finiteJson(args);
      if (!args || Array.isArray(args) || typeof args !== 'object' || JSON.stringify(args).length > 64000) fail('Invalid arguments');
      if (Object.keys(args).some(key => !(key in inputSchema.properties))) fail('Unexpected field');
      const result = run(args);
      onDiscovery(name);
      return result;
    },
  });
  return [
    wrap(BROWSER_TOOL_NAMES[0], 'Start S-Structures tasks here. First describe and read get_agent_start_context for workflow, current model and report rules. Discover functions by name or English description; paginate with nextOffset. Describe each selected tool before calling it. No model changes or solver runs.',
      object({ query: { type: 'string', maxLength: 128 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 12 } }), true,
      ({ query = '', offset = 0, limit = 12 }) => {
        if (typeof query !== 'string' || query.length > 128 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 12) fail('Invalid catalog query');
        const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
        const rows = catalog.filter(tool => words.every(word => `${tool.name} ${tool.description}`.toLowerCase().includes(word)));
        return { startHere: {name:'get_agent_start_context',instruction:'Describe and read this tool at task start and after reconnect; use its app workflow and canonical report contract within the user task.'}, total: rows.length, offset, nextOffset: offset + limit < rows.length ? offset + limit : null,
          tools: rows.slice(offset, offset + limit).map(tool => ({ name: tool.name, readOnly: tool.annotations?.readOnlyHint === true, summary: tool.description.slice(0, 160) })),
          next: 'Use describe_sstructures_tool for complete instructions and input schema.' };
      }),
    wrap(BROWSER_TOOL_NAMES[1], 'Read complete instructions, input schema and read/write classification for a discovered tool. For preview_design_changes, also retrieve get_design_input_schema for each command type. No execution.', object({ name }, ['name']), true,
      ({ name }) => {
        const { execute, ...tool } = lookup(name);
        return { ...structuredClone(tool), invokeWith: tool.annotations?.readOnlyHint === true ? BROWSER_TOOL_NAMES[2] : BROWSER_TOOL_NAMES[3] };
      }),
    wrap(BROWSER_TOOL_NAMES[2], 'Invoke a discovered read-only S-Structures tool with its exact arguments. Read describe_sstructures_tool first and follow all units, scope and prerequisites. Only tools declared read-only are accepted; some explicitly requested read tools calculate results. No design approval is implied.', input, true,
      ({ name, arguments: args }) => invoke(name, args, true)),
    wrap(BROWSER_TOOL_NAMES[3], 'Invoke a discovered S-Structures write/action tool. May edit models, run analyses/design, apply a selected repair, change views or export reports. Read describe_sstructures_tool first. Preserve required input hashes, preview handles, request IDs, user decisions and approval boundaries. Never invent missing inputs or infer design approval.', input, false,
      ({ name, arguments: args }) => invoke(name, args, false)),
  ];

  function invoke(name, args, readOnly) {
    const tool = lookup(name);
    if ((tool.annotations?.readOnlyHint === true) !== readOnly) fail('Wrong read/write tool channel');
    if (!args || Array.isArray(args) || typeof args !== 'object') fail('arguments must be an object');
    return tool.execute(structuredClone(args));
  }
}
