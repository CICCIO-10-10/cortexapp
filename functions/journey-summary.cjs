// Counts refer to browser identifiers in a bounded event sample, not people or sessions.
function summarizeJourneys(events, coverage = {}, now = Date.now()) {
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
    // 04/10/2026: prova TOLC dall'avvio reale, qualunque sia l'ingresso (selettore o link diretto
    // ?sim=tolc-…, che salta selettore e intro e quindi non entra nel percorso 'tolc').
    tolcAttempt: ['tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete'],
    // Le due tappe che contano: primo ripasso completato e ritorno a studiare un giorno dopo.
    review: ['review_first_completed', 'study_returned_next_day'],
    // Accesso chiesto dal risultato TOLC → ritorno → ripasso ripreso.
    tolcResume: ['tolc_result_login_click', 'tolc_resume_shown', 'tolc_resume_click'],
  };
  const PATHS_ONLY = new Set(['tolcLocalDeck', 'tolcAttempt']);
  const BRANCHES = ['tolc_selector_closed', 'tolc_test_quit', 'tolc_errors_login_completed', 'onboarding_skipped', 'cards_generation_failed', 'generated_cards_discarded',
    'tolc_error_deck_login_completed', 'tolc_error_save_prompt_shown', 'tolc_error_save_prompt_login_click', 'tolc_error_save_prompt_ai_click',
    'onboarding_bypassed', 'study_session_abandoned', 'tolc_error_deck_failed', 'guest_login_not_completed', 'tolc_resume_dismiss',
    'tolc_test_hidden', 'tolc_test_resumed', 'study_start_failed', 'guest_ai_gate_dismiss', 'guest_save_click'];
  const V3 = [...Object.values(PATHS).flat(), ...BRANCHES, 'onboarding_step_viewed'];
  const v3 = { steps: {}, paths: {}, breakdown: { gen_fail_reason: {}, tolc_closed_stage: {}, onboarding_skip_step: {}, tolc_quit_answered: [], tolc_deck_type: {},
    onboarding_variant: {}, onboarding_bypass_reason: {}, review_first_type: {}, review_first_flow: {}, returned_days_after: {}, returned_type: {},
    tolc_quit_then_completed: 0, tolc_quit_not_completed: 0 }, platforms: {}, since: null };
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
        // 04/10/2026: versioni dell'onboarding separate (prima del 29/09 era a più slide).
        if (e.type === 'onboarding_skipped' || e.type === 'onboarding_finished') inc(v3.breakdown.onboarding_variant, (m.variant || 'pre_2026_09_29') + ':' + e.type.replace('onboarding_', ''));
        if (e.type === 'onboarding_bypassed') inc(v3.breakdown.onboarding_bypass_reason, m.reason);
        if (e.type === 'study_start_failed') inc(v3.breakdown.study_start_failed_reason = v3.breakdown.study_start_failed_reason || {}, m.reason);
        if (e.type === 'review_first_completed') { inc(v3.breakdown.review_first_type, m.type); inc(v3.breakdown.review_first_flow, m.flow); }
        if (e.type === 'study_returned_next_day') { inc(v3.breakdown.returned_days_after, Number.isFinite(m.days_after) ? Math.min(m.days_after, 8) : null); inc(v3.breakdown.returned_type, m.type); }
        if (BRANCHES.includes(e.type) && !seen.has(e.type)) { v3.steps[e.type]++; seen.add(e.type); }
      }
      // Abbandono TOLC: 'tolc_test_quit' scatta anche quando l'app va in background. Si separa chi
      // poi ha comunque consegnato da chi non ha mai completato una prova dopo l'uscita.
      const quitTs = vEvents.filter(e => e.type === 'tolc_test_quit').map(e => e.ts);
      if (quitTs.length) {
        const firstQuit = Math.min(...quitTs);
        if (vEvents.some(e => e.type === 'tolc_sim_complete' && e.ts > firstQuit)) v3.breakdown.tolc_quit_then_completed++;
        else v3.breakdown.tolc_quit_not_completed++;
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
  // ── Tentativi TOLC (04/10/2026) ───────────────────────────────────────────
  // Unità = tentativo (meta.attempt), non browser né evento. Un tentativo è:
  //  completato  se c'è tolc_sim_complete;
  //  abbandonato se non è completato e c'è un'uscita esplicita (tolc_test_quit) oppure
  //              nessun evento del tentativo da più di ATTEMPT_ABANDON_AFTER_MS;
  //  in corso    altrimenti.
  // Pagina nascosta/ripresa (tolc_test_hidden/_resumed) NON sono abbandoni. Gli eventi senza
  // id di tentativo (client precedenti) sono solo contati, non reinterpretati.
  const ATTEMPT_ABANDON_AFTER_MS = 30 * 60 * 1000;
  const ATTEMPT_STEPS = ['tolc_test_start', 'tolc_first_answer', 'tolc_sim_complete', 'tolc_errors_generate_click',
    'tolc_error_deck_created', 'tolc_error_first_card_rated', 'tolc_error_session_completed', 'save_requested', 'save_succeeded'];
  const STEP_ALIAS = { tolc_result_login_click: 'save_requested', tolc_error_save_prompt_login_click: 'save_requested', tolc_error_deck_login_completed: 'save_succeeded' };
  const TOLC_ATTEMPT_TYPES = new Set([...ATTEMPT_STEPS, ...Object.keys(STEP_ALIAS), 'tolc_test_hidden', 'tolc_test_resumed', 'tolc_test_quit']);
  const attemptsMap = new Map();
  let legacyWithoutAttempt = 0;
  for (const e of events) {
    if (!TOLC_ATTEMPT_TYPES.has(e.type) || !Number.isFinite(e.ts)) continue;
    const a = e.meta && typeof e.meta.attempt === 'string' ? e.meta.attempt : null;
    if (!a) { legacyWithoutAttempt++; continue; }
    if (!attemptsMap.has(a)) attemptsMap.set(a, []);
    attemptsMap.get(a).push(e);
  }
  const attempts = { unit: 'tentativo', abandonAfterMinutes: ATTEMPT_ABANDON_AFTER_MS / 60000, total: 0, completed: 0, abandoned: 0, in_progress: 0,
    abandoned_explicit: 0, hidden: 0, hidden_then_completed: 0, path: Object.fromEntries(ATTEMPT_STEPS.map(k => [k, 0])),
    legacy_events_without_attempt: legacyWithoutAttempt };
  for (const list of attemptsMap.values()) {
    const sorted = list.slice().sort((x, y) => x.ts - y.ts);
    const types = new Set(sorted.map(x => x.type));
    if (!types.has('tolc_test_start')) continue;              // tentativo iniziato fuori dal campione
    attempts.total++;
    const completed = types.has('tolc_sim_complete');
    const lastTs = sorted[sorted.length - 1].ts;
    if (completed) attempts.completed++;
    else if (types.has('tolc_test_quit')) { attempts.abandoned++; attempts.abandoned_explicit++; }
    else if (now - lastTs > ATTEMPT_ABANDON_AFTER_MS) attempts.abandoned++;
    else attempts.in_progress++;
    if (types.has('tolc_test_hidden')) { attempts.hidden++; if (completed) attempts.hidden_then_completed++; }
    let next = 0;
    for (const ev of sorted) {
      const step = STEP_ALIAS[ev.type] || ev.type;
      if (step === ATTEMPT_STEPS[next]) { attempts.path[step]++; next++; if (next === ATTEMPT_STEPS.length) break; }
    }
  }
  v3.attempts = attempts;

  // ── Errori da utenti reali (26/09/2026), ultimi 7 giorni: eventi, browser distinti, motivi ──
  const ERR_TYPES = ['cloud_sync_failed', 'js_error', 'cards_generation_failed', 'firebase_sdk_unavailable', 'tolc_error_deck_failed'];
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
