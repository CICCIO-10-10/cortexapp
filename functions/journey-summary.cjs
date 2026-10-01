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
  // ── Tracking v4 — ordered funnels, unique browser IDs, split by environment ──
  const PATHS = {
    appActivation: ['app_open', 'cards_generation_started', 'cards_generated', 'generated_cards_saved', 'study_session_start'],
    tolc: ['tolc_selector_viewed', 'tolc_type_picked', 'tolc_intro_viewed', 'tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete'],
    tolcCards: ['tolc_errors_generate_click', 'tolc_error_cards_generation_started', 'tolc_error_cards_generated', 'tolc_error_cards_saved', 'tolc_error_first_study'],
    // 01/10/2026: mazzo errori creato in locale, senza AI (modules/tolcErrorDeck.js).
    // tolc_error_first_study = ingresso nella sessione; la prima carta valutata e' un passo a parte.
    tolcLocalDeck: ['tolc_sim_complete', 'tolc_error_deck_created', 'tolc_error_first_study', 'tolc_error_first_card_rated', 'tolc_error_session_completed'],
    onboarding: ['onboarding_shown', 'onboarding_finished'],
    generation: ['cards_generation_started', 'cards_generated', 'generated_cards_saved', 'study_session_start', 'study_session_completed', 'activated'],
  };
  const PATHS_ONLY = new Set(['tolcLocalDeck']);
  const BRANCHES = ['tolc_selector_closed', 'tolc_test_quit', 'tolc_errors_login_completed', 'onboarding_skipped', 'cards_generation_failed', 'generated_cards_discarded',
    'tolc_error_deck_login_completed', 'tolc_error_save_prompt_shown', 'tolc_error_save_prompt_login_click', 'tolc_error_save_prompt_ai_click'];
  const V3 = [...Object.values(PATHS).flat(), ...BRANCHES, 'onboarding_step_viewed'];
  const v3 = { steps: {}, paths: {}, breakdown: { gen_fail_reason: {}, tolc_closed_stage: {}, onboarding_skip_step: {}, tolc_quit_answered: [], tolc_deck_type: {} }, platforms: {}, since: null };
  V3.forEach(k => { v3.steps[k] = 0; });
  const v3Names = new Set([...V3, 'app_open']);
  const v3Start = events.filter(e => v3Names.has(e.type)).reduce((m, e) => Math.min(m, e.ts), Infinity);
  function orderedPathCounts(visitorMap, path) {
    const counts = Object.fromEntries(path.map(k => [k, 0]));
    for (const list of visitorMap.values()) {
      let next = 0;
      const sorted = list.slice().sort((a, b) => a.ts - b.ts);
      for (const event of sorted) {
        if (event.type === path[next]) { counts[path[next]]++; next++; if (next === path.length) break; }
      }
    }
    return counts;
  }
  function summarizeGroup(visitorMap) {
    const steps = {};
    const paths = {};
    for (const [name, path] of Object.entries(PATHS)) {
      paths[name] = orderedPathCounts(visitorMap, path);
      // tolcLocalDeck riusa eventi di altri percorsi (tolc_sim_complete, tolc_error_first_study):
      // i suoi conteggi ordinati restano solo in paths, senza sovrascrivere steps.
      if (!PATHS_ONLY.has(name)) Object.assign(steps, paths[name]);
    }
    for (const branch of BRANCHES) {
      steps[branch] = 0;
      for (const list of visitorMap.values()) if (list.some(e => e.type === branch)) steps[branch]++;
    }
    steps.onboarding_step_viewed = 0;
    for (const list of visitorMap.values()) if (list.some(e => e.type === 'onboarding_step_viewed')) steps.onboarding_step_viewed++;
    return { visitors: visitorMap.size, steps, paths };
  }
  if (Number.isFinite(v3Start)) {
    v3.since = v3Start;
    const allV3 = new Map();
    const byPlatform = new Map();
    for (const [visitorId, visitorEvents] of byVisitor.entries()) {
      const vEvents = visitorEvents.filter(e => e.ts >= v3Start && v3Names.has(e.type));
      if (!vEvents.length) continue;
      allV3.set(visitorId, vEvents);
      const seen = new Set();
      if (vEvents.some(e => e.type === 'onboarding_step_viewed')) v3.steps.onboarding_step_viewed++;
      for (const e of vEvents) {
        const m = e.meta || {};
        const inc = (obj, k) => { k = String(k == null ? 'n/d' : k); obj[k] = (obj[k] || 0) + 1; };
        if (e.type === 'cards_generation_failed') inc(v3.breakdown.gen_fail_reason, m.reason);
        if (e.type === 'tolc_selector_closed') inc(v3.breakdown.tolc_closed_stage, m.stage);
        if (e.type === 'onboarding_skipped') inc(v3.breakdown.onboarding_skip_step, m.step);
        if (e.type === 'tolc_test_quit' && typeof m.answered === 'number') v3.breakdown.tolc_quit_answered.push(m.answered);
        // Denominatore del login dopo il mazzo: solo i mazzi creati da ospite (meta.type='guest').
        if (e.type === 'tolc_error_deck_created') inc(v3.breakdown.tolc_deck_type, m.type);
        if (BRANCHES.includes(e.type) && !seen.has(e.type)) { v3.steps[e.type]++; seen.add(e.type); }
      }
      const platformEvents = new Map();
      for (const e of vEvents) {
        const p = e.meta && e.meta.platform;
        if (!p || !['android_twa', 'android_web', 'mobile_web', 'tablet_web', 'desktop_web'].includes(p)) continue;
        if (!platformEvents.has(p)) platformEvents.set(p, []);
        platformEvents.get(p).push(e);
      }
      for (const [p, list] of platformEvents.entries()) {
        if (!byPlatform.has(p)) byPlatform.set(p, new Map());
        byPlatform.get(p).set(visitorId, list);
      }
    }
    const allSummary = summarizeGroup(allV3);
    Object.assign(v3.steps, allSummary.steps);
    v3.paths = allSummary.paths;
    for (const [p, map] of byPlatform.entries()) v3.platforms[p] = summarizeGroup(map);
    // Counts that are branches are independent of the ordered path and must never
    // be used as the denominator for the next success step.
  }
  // ── Errori da utenti reali (26/09/2026), ultimi 7 giorni: eventi, browser distinti, motivi ──
  const ERR_TYPES = ['cloud_sync_failed', 'js_error', 'cards_generation_failed'];
  const errSince = Date.now() - 7 * 24 * 3600 * 1000;
  const errors = { since: errSince, events: {}, browsers: {}, reasons: {} };
  ERR_TYPES.forEach(t => { errors.events[t] = 0; errors.browsers[t] = 0; errors.reasons[t] = {}; });
  for (const visitorEvents of byVisitor.values()) {
    const hit = new Set();
    for (const e of visitorEvents) {
      if (!ERR_TYPES.includes(e.type) || e.ts < errSince) continue;
      errors.events[e.type]++;
      hit.add(e.type);
      const r = String(((e.meta || {}).reason) || 'n/d').slice(0, 80);
      errors.reasons[e.type][r] = (errors.reasons[e.type][r] || 0) + 1;
    }
    hit.forEach(t => { errors.browsers[t]++; });
  }
  const times = events.map(e => e.ts).filter(t => Number.isFinite(t) && t > 0);
  return { ...counts, visitors: byVisitor.size, sequential, v3, errors,
      coverage: { status: 'ok', unit: 'browser_id', ordered: true, ...coverage,
      eventCount: events.length, from: times.length ? Math.min(...times) : null,
      to: times.length ? Math.max(...times) : null, trackingVersion: 4 } };
}
module.exports = { summarizeJourneys };
