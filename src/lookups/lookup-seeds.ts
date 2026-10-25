import {
  DEFAULT_SEGMENT,
  SegmentId,
  SEGMENTS,
} from '../segments/segment-catalog';

// Cadastros auxiliares iniciais de cada ramo (setup e "trocar ramo").
export const lookupSeeds = (segment: SegmentId = DEFAULT_SEGMENT) =>
  SEGMENTS[segment].seeds;

export const lookupSeedRows = (segment: SegmentId = DEFAULT_SEGMENT) =>
  Object.entries(lookupSeeds(segment)).flatMap(([kind, names]) =>
    names.map((name, index) => ({ kind, name, sort: index })),
  );
