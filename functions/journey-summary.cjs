// Counts refer to browser identifiers in a bounded event sample, not people or sessions.
function summarizeJourneys(events, coverage = {}) {
  const stages = ['landing_view', 'app_open', 'onboarding_start', 'cards_generated', 'study_session_start', 'activated', 'tolc_sim_open', 'tolc_sim_complete'];
  const counts = Object.fromEntries(stages.map(s => [s, 0]));
  const byVisitor = new Map();
  for (const event of events) {
    if (!event.vid || !Number.isFinite(event.ts) || event.ts <= 0) continue;
    if (!byVisitor.has(event.vid)) byVisitor.set(event.vid, []);
    byVisitor.get(event.vid).push(event);
  }
  const sequence = ['app_open', 'cards_generated', 'study_session_start'];
  const sequential = sequence.map(event => ({ event, count: 0 }));
  for (const visitorEvents of byVisitor.values()) {
    const sorted = visitorEvents.sort((a, b) => a.ts - b.ts);
    const types = new Set(sorted.map(e => e.type));
    stages.forEach(stage => { if (types.has(stage)) counts[stage]++; });
    let next = 0;
    for (const event of sorted) {
      if (event.type === sequence[next]) { sequential[next].count++; next++; }
      if (next === sequence.length) break;
    }
  }
  const times = events.map(e => e.ts).filter(t => Number.isFinite(t) && t > 0);
  return { ...counts, visitors: byVisitor.size, sequential,
    coverage: { status: 'ok', unit: 'browser_id', ordered: true, ...coverage,
      eventCount: events.length, from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null, trackingVersion: 2 } };
}
module.exports = { summarizeJourneys };
