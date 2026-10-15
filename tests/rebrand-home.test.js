import { describe, it, expect } from 'vitest';
import { renderRebrandHome } from '../ui/components/RebrandHome.js';
describe('real-data rebrand home',()=>{
 it('keeps a useful guest state without fabricated materials',()=>{
  const html=renderRebrandHome();
  expect(html).toContain('La prima materia parte dai tuoi appunti');
  expect(html).toContain('data-fn="openTolcSim"');
  expect(html).not.toContain('class="cx-deck"');
 });
 it('prioritizes due cards without mutating the source collection',()=>{
  const decks=[{id:'a',name:'Prima',cards:[],dueCount:0},{id:'b',name:'Seconda',cards:[{}],dueCount:3}];
  const html=renderRebrandHome({decks});
  expect(html).toContain('3 carte in programma. Riparti da Seconda');
  expect(html.indexOf('<h3>Seconda')).toBeLessThan(html.indexOf('<h3>Prima'));
  expect(decks[0].id).toBe('a');
 });
 it('escapes user text and serializes identifiers safely in action attributes',()=>{
  const html=renderRebrandHome({name:'<img onerror=bad>',decks:[{id:`x'"\\<`,name:'<script>bad</script>',dueCount:1,cards:[]}]});
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img onerror');
  expect(html).toContain('&#39;');
  const encoded=html.match(/data-fn="startStudyById" data-params='([^']+)'/)[1];
  const decoded=encoded.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  expect(JSON.parse(decoded)).toEqual([`x'"\\<`]);
 });
});
