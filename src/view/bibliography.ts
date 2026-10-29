// Parses docs/BIBLIOGRAPHY.md into sections of numbered entries for the About page. Pure: the
// mount imports the file with Vite's `?raw` and hands the string here. The numbers are the ones
// MATH.md cites, so they are kept as written. Text is kept verbatim; `segments` only marks up
// the URL, `*italic*` and `code` so the page can render them.

export interface BibEntry {
  readonly number: number;
  /** The entry as written, after its number. */
  readonly text: string;
  /** The first URL in the entry, without trailing punctuation; null when there is none. */
  readonly url: string | null;
}

export interface BibSection {
  readonly heading: string;
  readonly entries: readonly BibEntry[];
}

export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

const ENTRY = /^(\d+)\.\s+(.*\S)\s*$/;
const URL_AT = /https?:\/\/\S+/;
const TRAILING = /[.,;:)\]]+$/;

function findUrl(text: string): string | null {
  const match = URL_AT.exec(text);
  return match ? match[0].replace(TRAILING, '') : null;
}

export function parseBibliography(source: string): BibSection[] {
  const sections: { heading: string; entries: BibEntry[] }[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      sections.push({ heading: line.slice(3).trim(), entries: [] });
      continue;
    }
    const entry = ENTRY.exec(line);
    const current = sections[sections.length - 1];
    if (entry && current) {
      const text = entry[2] as string;
      current.entries.push({ number: Number(entry[1]), text, url: findUrl(text) });
    }
  }
  return sections;
}

const MARKUP = /\*([^*]+)\*|`([^`]+)`/g;

function marked(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: 'em', text: m[1] } : { kind: 'code', text: m[2] as string });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** The entry split for rendering: text, emphasis and code around the URL, which becomes a link. */
export function segments(entry: BibEntry): Segment[] {
  if (entry.url === null) return marked(entry.text);
  const at = entry.text.indexOf(entry.url);
  return [
    ...marked(entry.text.slice(0, at)),
    { kind: 'link', text: entry.url, href: entry.url },
    ...marked(entry.text.slice(at + entry.url.length)),
  ];
}
