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
  // ── Tracking v3 (25/09/2026) — funnel separati, browser distinti per passo ──
  const V3 = {
    tolc: ['tolc_selector_viewed', 'tolc_type_picked', 'tolc_intro_viewed', 'tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete', 'tolc_errors_generate_click'],
    tolcLoss: ['tolc_selector_closed', 'tolc_test_quit'],
    onboarding: ['onboarding_shown', 'onboarding_finished', 'onboarding_skipped'],
    generation: ['cards_generation_started', 'cards_generated', 'cards_generation_failed', 'generated_cards_saved', 'generated_cards_discarded', 'study_session_start', 'study_session_completed', 'activated'],
  };
  const v3 = { steps: {}, breakdown: { gen_fail_reason: {}, tolc_closed_stage: {}, onboarding_skip_step: {}, tolc_quit_answered: [] }, since: null };
  Object.values(V3).flat().forEach(k => { v3.steps[k] = 0; });
  const v3Names = new Set(['tolc_selector_viewed', 'tolc_type_picked', 'tolc_intro_viewed', 'tolc_selector_closed', 'tolc_test_quit', 'onboarding_step_viewed', 'onboarding_finished', 'onboarding_skipped', 'cards_generation_started', 'cards_generation_failed', 'generated_cards_discarded']);
  const v3Start = events.filter(e => v3Names.has(e.type)).reduce((m, e) => Math.min(m, e.ts), Infinity);
  if (Number.isFinite(v3Start)) {
    v3.since = v3Start;
    for (const visitorEvents of byVisitor.values()) {
      const seen = new Set();
      for (const e of visitorEvents) {
        if (e.ts < v3Start) continue;
        if (Object.prototype.hasOwnProperty.call(v3.steps, e.type) && !seen.has(e.type)) { seen.add(e.type); v3.steps[e.type]++; }
        const m = e.meta || {};
        const inc = (obj, k) => { k = String(k == null ? 'n/d' : k); obj[k] = (obj[k] || 0) + 1; };
        if (e.type === 'cards_generation_failed') inc(v3.breakdown.gen_fail_reason, m.reason);
        if (e.type === 'tolc_selector_closed') inc(v3.breakdown.tolc_closed_stage, m.stage);
        if (e.type === 'onboarding_skipped') inc(v3.breakdown.onboarding_skip_step, m.step);
        if (e.type === 'tolc_test_quit' && typeof m.answered === 'number') v3.breakdown.tolc_quit_answered.push(m.answered);
      }
    }
  }
  const times = events.map(e => e.ts).filter(t => Number.isFinite(t) && t > 0);
  return { ...counts, visitors: byVisitor.size, sequential, v3,
    coverage: { status: 'ok', unit: 'browser_id', ordered: true, ...coverage,
      eventCount: events.length, from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null, trackingVersion: 2 } };
}
module.exports = { summarizeJourneys };
