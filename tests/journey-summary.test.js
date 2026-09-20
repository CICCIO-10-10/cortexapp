import { describe, it, expect } from 'vitest';
import summary from '../functions/journey-summary.cjs';
const { summarizeJourneys } = summary;
describe('journey sample and ordered cohort', () => {
  it('deduplicates visitors and excludes reversed or skipped steps from the sequence', () => {
    const events = [
      { vid:'a', type:'app_open', ts:1 }, { vid:'a', type:'app_open', ts:2 },
      { vid:'a', type:'cards_generated', ts:3 }, { vid:'a', type:'study_session_start', ts:4 },
      { vid:'b', type:'study_session_start', ts:1 }, { vid:'b', type:'cards_generated', ts:2 },
      { vid:'b', type:'app_open', ts:3 }, { vid:'c', type:'study_session_start', ts:1 }
    ];
    const result = summarizeJourneys(events, { limited: true });
    expect(result.visitors).toBe(3);
    expect(result.study_session_start).toBe(3);
    expect(result.sequential.map(s => s.count)).toEqual([2,1,1]);
    expect(result.coverage).toMatchObject({ from:1, to:4, limited:true, eventCount:8 });
  });
  it('reports an empty measured sample without inventing dates', () => {
    expect(summarizeJourneys([])).toMatchObject({ visitors:0, coverage:{ from:null, to:null, status:'ok' } });
  });
});
