import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBibliography, segments } from './bibliography';

describe('parseBibliography', () => {
  it('reads the real file: four sections, numbers 1 to 15 in order, as MATH.md cites them', () => {
    const sections = parseBibliography(readFileSync('docs/BIBLIOGRAPHY.md', 'utf8'));
    expect(sections.map((s) => s.heading)).toEqual([
      'Papers',
      'Practitioner sources',
      'Prior art: juggling and sound',
      'Software',
    ]);
    const all = sections.flatMap((s) => s.entries);
    expect(all.map((e) => e.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(all.filter((e) => e.url === null).map((e) => e.number)).toEqual([2]);
    expect(all[0]?.url).toBe('https://www.cecm.sfu.ca/organics/papers/buhler/paper/html/node1.html');
    expect(all[4]?.url).toBe('https://www.qedcat.com/articles/juggling_survey.pdf');
  });

  it('ignores prose and blank lines outside sections and entries, and CRLF', () => {
    const s = parseBibliography('# t\n\n1. before any section https://a.b\n\r\n## S\r\n\r\nnote\n7. x https://y.z/p.\n');
    expect(s).toEqual([{ heading: 'S', entries: [{ number: 7, text: 'x https://y.z/p.', url: 'https://y.z/p' }] }]);
  });

  it('keeps an entry with no URL and strips trailing text punctuation from a URL', () => {
    const [s] = parseBibliography('## S\n1. none here\n2. see (https://a.b/c). More text\n');
    expect(s?.entries.map((e) => e.url)).toEqual([null, 'https://a.b/c']);
  });
});

describe('segments', () => {
  it('marks the link, italics and code, keeping the surrounding text', () => {
    const entry = { number: 1, text: 'A, *Journal* 1, `x.ts` https://a.b/c end', url: 'https://a.b/c' };
    expect(segments(entry)).toEqual([
      { kind: 'text', text: 'A, ' },
      { kind: 'em', text: 'Journal' },
      { kind: 'text', text: ' 1, ' },
      { kind: 'code', text: 'x.ts' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'https://a.b/c', href: 'https://a.b/c' },
      { kind: 'text', text: ' end' },
    ]);
  });

  it('renders an entry with no URL as text only', () => {
    expect(segments({ number: 2, text: 'plain', url: null })).toEqual([{ kind: 'text', text: 'plain' }]);
  });

  it('starts with the link when the URL opens the entry', () => {
    expect(segments({ number: 3, text: 'https://a.b', url: 'https://a.b' })).toEqual([
      { kind: 'link', text: 'https://a.b', href: 'https://a.b' },
    ]);
  });
});
