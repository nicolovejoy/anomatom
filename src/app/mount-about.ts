// The About page (SPEC §4.4; three layers since docs/plans/v4-1-polish.md, ruling 4). `main.ts` shows it when the hash is `#about`; playback carries on
// underneath, so this mount never touches the player.
import bibliographySource from '../../docs/BIBLIOGRAPHY.md?raw';
import { copy } from '../ui/copy';
import { parseBibliography, segments } from '../view/bibliography';
import type { Mount } from './mount';
import './about.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** An external link: a new tab, with no access back to this page. */
function external(href: string, text: string): HTMLAnchorElement {
  const a = el('a', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** The host, plus the path when it is short (GitHub repos); the href stays the full URL. */
function linkLabel(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/$/, '');
  return path.length > 0 && host.length + path.length < 40 ? host + path : host;
}

/** Layer 1: what anomatom is, in two lines, then how to use it, in three. */
function intro(): HTMLElement {
  const s = el('section');
  s.className = 'about-intro';
  const how = el('ul');
  how.append(...copy.aboutHow.map((line) => el('li', line)));
  s.append(...copy.aboutIntro.map((line) => el('p', line)), el('h3', copy.aboutHowHeading), how);
  return s;
}

/** Layer 2: a few words, one line each. */
function glossary(): HTMLElement {
  const s = el('section');
  s.className = 'about-glossary';
  const list = el('dl');
  for (const { term, text } of copy.aboutGlossary) list.append(el('dt', term), el('dd', text));
  s.append(el('h3', copy.aboutGlossaryHeading), list);
  return s;
}

function bibliography(): HTMLElement {
  const s = el('div');
  const lead = el('p');
  lead.append(copy.aboutMathLead, external(copy.aboutMathUrl, copy.aboutMathLink), copy.aboutMathTail);
  s.append(el('h4', copy.aboutReadingHeading), lead);
  for (const { heading, entries } of parseBibliography(bibliographySource)) {
    const list = el('ol');
    list.className = 'bibliography';
    for (const entry of entries) {
      const item = el('li');
      item.value = entry.number;
      for (const seg of segments(entry)) {
        if (seg.kind === 'link') item.append(external(seg.href, linkLabel(seg.href)));
        else if (seg.kind === 'em') item.append(el('em', seg.text));
        else if (seg.kind === 'code') item.append(el('code', seg.text));
        else item.append(seg.text);
      }
      list.append(item);
    }
    s.append(el('h5', heading), list);
  }
  return s;
}

function credits(): HTMLElement {
  const s = el('div');
  const list = el('ul');
  for (const c of copy.aboutCredits) {
    const item = el('li');
    item.append(external(c.url, c.name), `, ${c.note}`);
    list.append(item);
  }
  const repo = el('p');
  repo.append(external(copy.aboutRepoUrl, copy.aboutRepo), `. ${copy.aboutLicence}`);
  s.append(el('h4', copy.aboutCreditsHeading), list, repo);
  return s;
}

/** Layer 3, below the fold: the bibliography, the math notes, the credits and the repo. */
function sources(): HTMLElement {
  const s = el('section');
  s.className = 'about-sources';
  s.append(el('h3', copy.aboutSourcesHeading), bibliography(), credits());
  return s;
}

export const mountAbout: Mount = (root, { store }) => {
  const page = el('article');
  page.className = 'about';

  const back = el('a', copy.aboutBack);
  // Back to the last play-view state, or to the bare play view before there is one.
  const setBack = () => (back.href = store.get().lastStateHash ?? '#');
  setBack();
  store.subscribe(setBack);

  page.append(el('h2', copy.aboutTitle), back, intro(), glossary(), sources());
  root.append(page);
  return {};
};
