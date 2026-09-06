import { signedAccidentalVariants } from './signedAccidentalVariants.js';

const BASES = [
  ['WX', 'Wind X', 'wind'],
  ['WY', 'Wind Y', 'wind'],
  ['EX', 'Seismic X', 'seismic'],
  ['EY', 'Seismic Y', 'seismic'],
];

export function signedAccidentalLoadCases() {
  return BASES.flatMap(([base, name, type]) => signedAccidentalVariants(base).map((item) => ({
    id: item.caseId,
    name: `${name} ${item.label}`,
    type,
    parentCase: base,
    accidentalSign: item.sign,
  })));
}
