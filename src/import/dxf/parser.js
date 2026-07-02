export const DXF_PARSER_VERSION = 'p3-m6-dxf-parser';

export function parseDxf(text = '') {
  const pairs = tokenizeDxf(text);
  const sections = {};
  let current = null;
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value === 'SECTION') {
      const name = pairs[i + 1]?.code === 2 ? pairs[i + 1].value : 'UNKNOWN';
      current = { name, pairs: [] };
      sections[name] = current;
      i += 1;
    } else if (pair.code === 0 && pair.value === 'ENDSEC') {
      current = null;
    } else if (current) {
      current.pairs.push(pair);
    }
  }
  return {
    version: DXF_PARSER_VERSION,
    pairs,
    sections,
    header: parseHeader(sections.HEADER?.pairs || []),
    layers: parseLayers(sections.TABLES?.pairs || []),
  };
}

export function tokenizeDxf(text = '') {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(String(lines[i]).trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: castValue(code, lines[i + 1]) });
  }
  return pairs;
}

function parseHeader(pairs) {
  const header = {};
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].code !== 9) continue;
    const key = pairs[i].value;
    const values = [];
    for (let j = i + 1; j < pairs.length && pairs[j].code !== 9; j += 1) values.push(pairs[j]);
    header[key] = values.length === 1 ? values[0].value : values.map((pair) => pair.value);
  }
  return header;
}

function parseLayers(pairs) {
  const layers = [];
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].code === 0 && pairs[i].value === 'LAYER') {
      const layer = { name: null, color: null, flags: null };
      for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j += 1) {
        if (pairs[j].code === 2) layer.name = String(pairs[j].value);
        if (pairs[j].code === 62) layer.color = Number(pairs[j].value);
        if (pairs[j].code === 70) layer.flags = Number(pairs[j].value);
      }
      if (layer.name) layers.push(layer);
    }
  }
  return layers;
}

function castValue(code, raw) {
  const text = String(raw ?? '').trim();
  if ((code >= 10 && code <= 59) || (code >= 210 && code <= 239)) return Number(text);
  if ((code >= 60 && code <= 99) || (code >= 170 && code <= 179) || (code >= 270 && code <= 289)) return Number.parseInt(text, 10);
  if ((code >= 40 && code <= 49) || (code >= 140 && code <= 149)) return Number(text);
  return text;
}
