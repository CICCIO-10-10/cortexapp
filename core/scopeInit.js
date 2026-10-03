/**
 * core/scopeInit.js — DEVE essere il primo import di main.js (audit 2026-10, fase 2.1).
 * Fissa lo spazio dati dell'account prima che qualsiasi altro modulo legga dati
 * di studio da localStorage (es. la gamification legge mm_gstate al caricamento).
 */
import { ensureScopeInitialized } from './accountScope.js';

ensureScopeInitialized();
