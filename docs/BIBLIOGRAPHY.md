# anomatom — bibliography

Shipped on the About page. Papers first, then practitioner sources and prior art. Numbers are the ones `MATH.md` cites.

The About page (stream F, 2026-10-29) cites only entries opened and checked: 1, 5, 13, 16, 18, 19, 20 and 22. Entries 2, 17 and 23 carry the not-yet-opened marker and stay off it until opened. Entries 1 and 5 were not re-opened in this stream; the page says only that they treat juggling sequences and the average of the digits.

## Papers

1. Buhler, J., Eisenbud, D., Graham, R., Wright, C. (1994). Juggling Drops and Descents. *American Mathematical Monthly* 101(6), 507–519. https://www.cecm.sfu.ca/organics/papers/buhler/paper/html/node1.html
2. Buhler, J., Graham, R. (2004). Juggling patterns, passing, and posets. In *Mathematical Adventures for Students and Amateurs*, MAA, 99–116.
<!-- (Listed from citations in 4 and 6; not yet opened. Check before it goes on the About page.) -->
3. Ehrenborg, R., Readdy, M. (1996). Juggling and applications to q-analogues. *Discrete Mathematics* 157, 107–125. https://www.ms.uky.edu/~jrge/papers/Juggle.pdf
4. Chung, F., Graham, R. (2008). Primitive Juggling Sequences. *American Mathematical Monthly* 115(3), 185–194. https://fanchung.ucsd.edu/wp/pjs.pdf
5. Polster, B. (2003). *The Mathematics of Juggling*. Springer. Survey article: https://www.qedcat.com/articles/juggling_survey.pdf
6. Butler, S., Graham, R. (2010). Enumerating (multiplex) juggling sequences. *Annals of Combinatorics* 13(4), 413–424. https://arxiv.org/pdf/0801.2597

## Practitioner sources

7. Nickmans, H. (2015). Assumptions in vanilla siteswap: paths to new patterns. *eJuggle*, International Jugglers' Association. https://www.juggle.org/assumptions-in-vanilla-siteswap-paths-to-new-patterns/
8. Wright, C. Site Swaps: How to write down a juggling pattern. https://solipsys.co.uk/new/SiteSwap.html

## Prior art: juggling and sound

9. Leischner, V., Husa, P. (2023). Sonification of a juggling performance using spatial audio. *Proceedings of the ACM on Human-Computer Interaction*. https://dl.acm.org/doi/fullHtml/10.1145/3597619
10. JuggLing-a-Ding: Design and Development of a Musical Juggling Toolkit (2026). *NIME 2026*. https://nime.org/proceedings/2026/nime2026_76.pdf

## Software

11. sani.js, siteswap animator, MIT. https://github.com/monkape/sani.js
12. smplr, sampled instruments for Web Audio, MIT. https://github.com/danigb/smplr
13. Boyce, J. Juggling Lab. https://github.com/jkboyce/jugglinglab. Its internal representation is Multi-Hand Notation, "name due to Ed Carstens": a matrix of hands and discrete event times, patterns as transitions between its elements; the source notes MHN "has no standardized string (textual) representation" (`composeApp/src/commonMain/kotlin/org/jugglinglab/notation/MhnPattern.kt`, opened 2026-10-29).
14. Helbling, C. passist, passing siteswap assistant, GPLv3 (considered, not used). https://passist.org/
15. L6 (nicolovejoy/l6-music), whose `piano-sound.ts` and `midi-input.ts` this project reuses. https://github.com/nicolovejoy/l6-music

## Rhythm, meter and perception

Added 2026-10-29 for `MATH.md` §9. Each entry says what was opened and what it confirmed.

16. Toussaint, G. (2005). The Euclidean Algorithm Generates Traditional Musical Rhythms. *Renaissance Banff: Mathematics, Music, Art, Culture* (BRIDGES 2005), 47–56. https://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf (proceedings page: https://archive.bridgesmathart.org/2005/bridges2005-47.html). Opened: E(k, n) by Bjorklund's algorithm; E(3,8) the tresillo, E(4,9) Brubeck's Rondo a la Turk, E(7,12) "a common West African bell pattern", E(5,16) the bossa-nova necklace; rhythm necklaces.
17. Bjorklund, E. (2003). The theory of rep-rate pattern generation in the SNS timing system. SNS ASD Technical Note SNS-NOTE-CNTRL-99, Los Alamos National Laboratory.
<!-- (Cited as given in 16, reference [5]; the note itself not found online, not yet opened. Check before it goes on the About page.) -->
18. Toussaint, G. T. (2013). *The Geometry of Musical Rhythm: What Makes a "Good" Rhythm Good?* Chapman & Hall/CRC; second edition 2020. https://www.routledge.com/The-Geometry-of-Musical-Rhythm-What-Makes-a-Good-Rhythm-Good-Second/Toussaint/p/book/9780815370970. Opened: the second edition's contents, with chapters "Necklaces and Bracelets", "Dispersion Problems: Perfectly Even, Maximally Even, and Balanced Rhythms", "Euclidean Rhythms, Euclidean Strings, and Well-Formed Rhythms" and "The Isomorphism Between Rhythms and Scales"; the 2013 date from the author's page, https://cgm.cs.mcgill.ca/~godfried/cv/books.html. First-edition contents not checked.
19. Krebs, H. (1999). *Fantasy Pieces: Metrical Dissonance in the Music of Robert Schumann*. Oxford University Press. https://academic.oup.com/book/8293. Opened: the abstract names grouping dissonance, "based on the association of incongruent metrical layers", and displacement dissonance, "based on the non-aligned presentation of congruent layers".
20. Bregman, A. S. (1990). *Auditory Scene Analysis: The Perceptual Organization of Sound*. MIT Press. https://webpages.mcgill.ca/staff/Group2/abregm1/web/labbook.htm. Opened: the author's page on the book; chapter 1 introduces "the concept of the auditory stream".
21. London, J. (2004). *Hearing in Time: Psychological Aspects of Musical Meter*. Oxford University Press. https://academic.oup.com/book/11161. Opened: the abstract treats meter as entrainment of attention and "allows for meters that involve uneven (i.e., non-isochronous) beats". Cited for the isochronous/non-isochronous distinction, not for a claim that meter must be isochronous.
22. Kubik, G. (1962). The phenomenon of inherent rhythms in East and Central African instrumental music. *African Music* 3(1), 33–42. https://doi.org/10.21504/amj.v3i1.735 (opened at https://journal.ru.ac.za/index.php/africanmusic/article/view/735). Opened: the abstract only, on notes grouped by the ear into conflicting "gestalten"; the full text not read.
23. Pressing, J. (1983). Cognitive isomorphisms between pitch and rhythm in world musics: West Africa, the Balkans and Western Tonality. *Studies in Music* 17, 38–61. Not online; confirmed second-hand: cited by 16 (reference [24]), and Hahn, *Music Theory Online* 27(2), 2021, ¶44 (https://mtosmt.org/issues/mto.21.27.2/mto.21.27.2.hahn.html) attributes to it "a cognitive isomorphism between the rhythm ME(7, 12) (2212221) and the diatonic major scale".
<!-- (Pressing's paper itself not opened. Check before it goes on the About page.) -->
