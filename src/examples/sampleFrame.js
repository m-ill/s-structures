import { createModel } from '../core/model.js';
import { normalizeStories } from '../core/storyModel.js';

export function createPortalFrameSample() {
  const model = createModel();
  const points = [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ];
  const bottom = [];
  const top = [];
  let nextId = 1;
  const uid = (prefix) => `${prefix}${nextId++}`;

  for (const point of points) {
    const nb = { id: uid('N'), x: point[0], y: point[1], z: 0, support: 'fixed' };
    const nt = { id: uid('N'), x: point[0], y: point[1], z: 3, support: null };
    model.nodes.push(nb, nt);
    bottom.push(nb);
    top.push(nt);
  }

  for (let i = 0; i < 4; i += 1) {
    model.members.push({
      id: uid('M'),
      n1: bottom[i].id,
      n2: top[i].id,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
    });
  }

  const beams = [];
  for (let i = 0; i < 4; i += 1) {
    const member = {
      id: uid('M'),
      n1: top[i].id,
      n2: top[(i + 1) % 4].id,
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
    };
    model.members.push(member);
    beams.push(member);
  }

  model.loads.push({
    id: uid('L'),
    type: 'udl',
    member: beams[0].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });
  model.loads.push({
    id: uid('L'),
    type: 'udl',
    member: beams[2].id,
    w: 8,
    dir: '-z',
    direction: [0, 0, -1],
    coordinate: 'global',
    unit: 'kN/m',
    case: 'D',
  });

  return normalizeStories(model);
}
