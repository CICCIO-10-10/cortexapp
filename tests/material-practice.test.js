import { it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../modules/pdfToFlashcards.js', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('export function validateStudyCards'), source.indexOf('export function openMaterialPractice')).replace('export ', '');
const validate = vm.runInNewContext(section + '; validateStudyCards');
it('accepts only four distinct multiple choice options containing the correct answer', () => {
    const good = { front: 'Capitale?', back: 'Roma', options: ['Roma', 'Milano', 'Torino', 'Napoli'] };
    expect(validate([null, good, { ...good, options: ['Roma', 'Roma', 'Roma', 'Roma'] }, { ...good, back: 'Parigi' }], 'multiple')).toEqual([good]);
    expect(() => validate([{ front: 'Q', back: 'A' }], 'multiple')).toThrow();
});
it('accepts open questions without options and rejects empty or malformed responses', () => {
    expect(validate([{ front: 'Spiega', back: 'Riferimento' }], 'open')).toHaveLength(1);
    expect(() => validate([null, { front: '', back: 'A' }], 'open')).toThrow();
    expect(() => validate({}, 'open')).toThrow();
});
