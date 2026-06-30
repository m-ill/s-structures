import { createModel } from '../core/modelFactory.js';
import { normalizeStories } from '../core/storyModel.js';

export const INDEX_STARTUP_SAMPLE_VERSION = 'm27-index-startup-sample';

export function createIndexStartupSampleModel() {
  const sample = createModel();
  const points = [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ];
  const bottom = [];
  const top = [];
  let next = 1;
  const uid = () => `I${next++}`;

  for (const [x, y] of points) {
    const base = { id: uid(), x, y, z: 0, support: 'fixed' };
    const roof = { id: uid(), x, y, z: 3, support: null };
    sample.nodes.push(base, roof);
    bottom.push(base);
    top.push(roof);
  }

  for (let i = 0; i < 4; i += 1) {
    sample.members.push({
      id: uid(),
      type: 'frame',
      n1: bottom[i].id,
      n2: top[i].id,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
      design: { role: 'column' },
    });
  }

  const beams = [];
  for (let i = 0; i < 4; i += 1) {
    const beam = {
      id: uid(),
      type: 'frame',
      n1: top[i].id,
      n2: top[(i + 1) % 4].id,
      matId: 'steel',
      secId: 'h400',
      localAxis: { roll: 0, strongAxis: 'z' },
      design: { role: 'beam' },
    };
    sample.members.push(beam);
    beams.push(beam);
  }

  sample.loads.push({
    id: uid(),
    type: 'udl',
    member: beams[0].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });
  sample.loads.push({
    id: uid(),
    type: 'udl',
    member: beams[2].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });
  return normalizeStories(sample);
}
