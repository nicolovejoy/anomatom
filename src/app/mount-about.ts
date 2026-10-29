// The About page (SPEC §4.4). `main.ts` shows it when the hash is `#about`; playback carries on
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

function section(heading: string, paragraphs: readonly string[]): HTMLElement {
  const s = el('section');
  s.append(el('h3', heading), ...paragraphs.map((p) => el('p', p)));
  return s;
}

function bibliography(): HTMLElement {
  const s = el('section');
  s.append(el('h3', copy.aboutReadingHeading), el('p', copy.aboutReadingIntro));
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
    s.append(el('h4', heading), list);
  }
  return s;
}

function credits(): HTMLElement {
  const s = el('section');
  const list = el('ul');
  for (const c of copy.aboutCredits) {
    const item = el('li');
    item.append(external(c.url, c.name), `, ${c.note}`);
    list.append(item);
  }
  s.append(el('h3', copy.aboutCreditsHeading), list);
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

  const repo = el('p');
  repo.append(external(copy.aboutRepoUrl, copy.aboutRepo), `. ${copy.aboutLicence}`);

  page.append(
    el('h2', copy.aboutTitle),
    back,
    section(copy.aboutIdeaHeading, copy.aboutIdea),
    section(copy.aboutSoundHeading, copy.aboutSound),
    bibliography(),
    credits(),
    repo,
  );
  root.append(page);
  return {};
};
