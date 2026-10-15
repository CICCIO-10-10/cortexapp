import { describe, it, expect } from 'vitest';
import { matchesMaterial } from '../ui/components/LibraryTools.js';
describe('library filtering',()=>{
 it('searches names and subjects without case or accent sensitivity',()=>{
  expect(matchesMaterial({name:'Università',subject:'Biologia'},'universita','all')).toBe(true);
  expect(matchesMaterial({name:'Cellule',subject:'Biologia'},' BIO ','all')).toBe(true);
  expect(matchesMaterial({name:'Cellule'},'matematica','all')).toBe(false);
 });
 it('combines search with due counts and handles empty fields',()=>{
  expect(matchesMaterial({name:'Biologia',dueCount:0},'bio','due')).toBe(false);
  expect(matchesMaterial({name:'Biologia',dueCount:3},'bio','due')).toBe(true);
  expect(matchesMaterial({},'','all')).toBe(true);
  expect(matchesMaterial({},'','due')).toBe(false);
 });
});
