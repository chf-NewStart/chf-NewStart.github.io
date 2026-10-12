/* Demo data for the Epitome UI prototype.

   Everything here is hand-written stand-in content so the front end can be
   built before the real store and API (WP3) exist. The article text is not
   output of the Epitome pipeline, and the source lists are samples — the
   article page says so on every topic. Replace this file, not the views,
   when real data arrives.

   Background images are public-domain research imagery on Wikimedia Commons,
   loaded through Special:FilePath so only the file name is needed. Check each
   credit against its Commons page before showing the site to anyone. */
(function () {
  'use strict';

  const commons = (file) => ({
    src: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file),
    page: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(file)
  });

  const backgrounds = [
    {
      topic: 'ngc-1300',
      ...commons('Hubble2005-01-barred-spiral-galaxy-NGC1300.jpg'),
      alt: 'The barred spiral galaxy NGC 1300: a straight bar of stars with two spiral arms, against black space.',
      caption: 'the structure and star-formation history of NGC 1300, a barred spiral galaxy 61 million light-years away, observed by the Hubble Space Telescope.',
      credit: 'NASA, ESA, and The Hubble Heritage Team (STScI/AURA)',
      license: 'Public domain',
      position: '50% 50%'
    },
    {
      topic: 'crab-nebula',
      ...commons('Crab Nebula.jpg'),
      alt: 'The Crab Nebula: orange and red filaments around a blue glowing core.',
      caption: 'the Crab Nebula, the still-expanding remains of a star whose explosion was recorded in 1054, assembled from Hubble exposures.',
      credit: 'NASA, ESA, J. Hester and A. Loll (Arizona State University)',
      license: 'Public domain',
      position: '50% 50%'
    },
    {
      topic: 'pollen-morphology',
      ...commons('Misc pollen.jpg'),
      alt: 'Coloured scanning electron micrograph of pollen grains from several plants: spiky spheres, smooth ovals and ridged grains.',
      caption: 'pollen grains from common plants, imaged with a scanning electron microscope; their surface patterns identify the plants that made them.',
      credit: 'Dartmouth College Electron Microscope Facility',
      license: 'Public domain',
      position: '50% 45%'
    },
    {
      topic: 'diatoms',
      ...commons('Diatoms through the microscope.jpg'),
      alt: 'Diatoms under a light microscope: glassy single-celled algae in many geometric shapes.',
      caption: 'diatoms, single-celled algae in glass shells that carry out a large share of the ocean’s photosynthesis.',
      credit: 'Prof. Gordon T. Taylor, Stony Brook University (NOAA)',
      license: 'Public domain',
      position: '50% 50%'
    }
  ];

  const topics = [
    {
      slug: 'ngc-1300',
      title: 'NGC 1300',
      aliases: ['barred spiral', 'galaxy', 'galaxies', 'galactic bar', 'hubble', 'eridanus'],
      state: 'warm',
      summary: 'A barred spiral galaxy about 61 million light-years away, and a textbook example of how a bar of stars shapes a galaxy.',
      revision: { number: 14, date: '2026-10-03' },
      checks: { citations: 'pass', drift: 'pass', lastRun: '2026-10-09' },
      history: [
        { number: 14, date: '2026-10-03', note: 'Re-checked all citations; tightened the section on gas inflow.' },
        { number: 13, date: '2026-09-27', note: 'Added the nuclear spiral seen in the 2004 Hubble images.' },
        { number: 12, date: '2026-09-21', note: 'Reader comment: corrected the galaxy’s diameter.' },
        { number: 1, date: '2026-08-30', note: 'First article, written after the first request.' }
      ],
      body: [
        '## Overview',
        'NGC 1300 is a barred spiral galaxy in the constellation Eridanus, about 61 million light-years from Earth and roughly 110,000 light-years across [@1]. A straight central bar of stars, with two spiral arms trailing from its ends, makes it one of the most reproduced examples of the barred type, a class that includes most nearby disk galaxies, the Milky Way among them [@2].',
        '## How the bar moves gas',
        'A bar is a pattern of stars on elongated orbits that rotates as a single unit. Its gravity exerts torques on the surrounding gas, which loses angular momentum and flows inward along the bar [@2]. The dark dust lanes along the leading edges of the bar mark where this inflowing gas is compressed in shocks [@3].',
        '## The core',
        'At the centre, the 2004 Hubble images show a small *grand-design* spiral about 3,300 light-years across, nested inside the bar [@1]. Inner structures like this are one route by which bars feed gas toward galactic nuclei and slowly build central concentrations of stars, a process known as secular evolution [@4].',
        '## Still open',
        '- How long bars last, and whether they dissolve and re-form, is still debated [@2].',
        '- Whether the inflow reaches the central black hole, or stalls in the inner disk, varies from galaxy to galaxy [@4].'
      ].join('\n\n'),
      sources: [
        { authors: 'Hubble Heritage Team', year: 2005, title: 'Barred spiral galaxy NGC 1300 (news release STScI-2005-01)', venue: 'Space Telescope Science Institute', oa: true },
        { authors: 'Sellwood, J. A. & Wilkinson, A.', year: 1993, title: 'Dynamics of barred galaxies', venue: 'Reports on Progress in Physics 56, 173–256' },
        { authors: 'Athanassoula, E.', year: 1992, title: 'The existence and shapes of dust lanes in galactic bars', venue: 'Monthly Notices of the Royal Astronomical Society 259, 345–364' },
        { authors: 'Kormendy, J. & Kennicutt, R. C.', year: 2004, title: 'Secular evolution and the formation of pseudobulges in disk galaxies', venue: 'Annual Review of Astronomy and Astrophysics 42, 603–683', oa: true }
      ]
    },
    {
      slug: 'crab-nebula',
      title: 'The Crab Nebula',
      aliases: ['crab', 'm1', 'messier 1', 'supernova', 'supernova remnant', 'nebula', 'pulsar wind'],
      state: 'mature',
      summary: 'The expanding remains of a star whose explosion was recorded in 1054, kept glowing by a pulsar spinning about 30 times a second.',
      revision: { number: 31, date: '2026-10-08' },
      checks: { citations: 'pass', drift: 'pass', lastRun: '2026-10-10' },
      cluster: ['crab-nebula', 'crab-pulsar', 'sn-1054-records'],
      history: [
        { number: 31, date: '2026-10-08', note: 'No content change; new papers checked, none changed a claim.' },
        { number: 30, date: '2026-09-19', note: 'Split the pulsar into its own article in this set.' },
        { number: 29, date: '2026-09-02', note: 'Reader comment: clarified that the expansion speed applies to the filaments.' },
        { number: 1, date: '2026-06-14', note: 'First article, written after the first request.' }
      ],
      body: [
        '## Overview',
        'The Crab Nebula (Messier 1) is the remnant of a supernova seen from Earth in 1054 and recorded by Chinese and Japanese astronomers as a “guest star” bright enough to see in daylight for weeks [@1]. It lies about 6,500 light-years away in Taurus, is roughly 11 light-years across, and its filaments are still expanding at around 1,500 kilometres per second [@1].',
        '## The pulsar at the centre',
        'In 1968 radio astronomers found a pulsar near the nebula’s centre [@2]: a neutron star, the collapsed core of the star that exploded, rotating about 30 times a second. Its spin is gradually slowing, and the energy it loses is what keeps the nebula glowing [@1].',
        '## Why it shines across the spectrum',
        'The pulsar drives a wind of electrons and positrons moving close to the speed of light. Spiralling through the nebula’s magnetic field, these particles give off synchrotron radiation from radio waves to gamma rays, which is why the Crab is one of the brightest high-energy sources in the sky and a standard calibration target for X-ray and gamma-ray telescopes [@1].'
      ].join('\n\n'),
      sources: [
        { authors: 'Hester, J. J.', year: 2008, title: 'The Crab Nebula: an astrophysical chimera', venue: 'Annual Review of Astronomy and Astrophysics 46, 127–155' },
        { authors: 'Staelin, D. H. & Reifenstein, E. C.', year: 1968, title: 'Pulsating radio sources near the Crab Nebula', venue: 'Science 162, 1481–1483' }
      ]
    },
    {
      slug: 'crab-pulsar',
      title: 'The Crab Pulsar',
      aliases: ['pulsar', 'neutron star', 'psr b0531+21', 'crab'],
      state: 'warm',
      summary: 'The neutron star left behind by the supernova of 1054, and the engine that powers the Crab Nebula.',
      revision: { number: 5, date: '2026-10-01' },
      checks: { citations: 'pass', drift: 'pass', lastRun: '2026-10-10' },
      cluster: ['crab-nebula', 'crab-pulsar', 'sn-1054-records'],
      history: [
        { number: 5, date: '2026-10-01', note: 'Checked against two new timing papers; no change.' },
        { number: 1, date: '2026-09-19', note: 'Split out of The Crab Nebula.' }
      ],
      body: [
        'The Crab Pulsar is the neutron star at the centre of the Crab Nebula, the collapsed core of the star that exploded in 1054. It was found in 1968, shortly after the first pulsars were discovered, and it was one of the first pulsars tied to a known supernova remnant [@1].',
        'It rotates about 30 times per second, sweeping a beam past Earth on each turn, and its pulses are seen from radio waves to gamma rays. The rotation is slowly winding down; the energy released as it slows feeds the wind of particles that lights up the surrounding nebula [@2].'
      ].join('\n\n'),
      sources: [
        { authors: 'Staelin, D. H. & Reifenstein, E. C.', year: 1968, title: 'Pulsating radio sources near the Crab Nebula', venue: 'Science 162, 1481–1483' },
        { authors: 'Hester, J. J.', year: 2008, title: 'The Crab Nebula: an astrophysical chimera', venue: 'Annual Review of Astronomy and Astrophysics 46, 127–155' }
      ]
    },
    {
      slug: 'sn-1054-records',
      title: 'Records of the supernova of 1054',
      aliases: ['1054', 'guest star', 'historical supernova', 'supernova', 'crab nebula'],
      state: 'cold',
      requests: 2,
      summary: 'How astronomers in China, Japan and elsewhere recorded the “guest star” of 1054.'
    },
    {
      slug: 'pollen-morphology',
      title: 'Pollen morphology',
      aliases: ['pollen', 'palynology', 'sporopollenin', 'exine', 'pollen grain'],
      state: 'warm',
      summary: 'Why pollen grains from different plants look so different under a microscope, and why that makes them useful to science.',
      revision: { number: 3, date: '2026-10-06' },
      checks: { citations: 'pass', drift: 'pending', lastRun: '2026-10-06' },
      history: [
        { number: 3, date: '2026-10-06', note: 'Added uses in climate reconstruction.' },
        { number: 2, date: '2026-10-02', note: 'Rewrote the overview for non-specialists.' },
        { number: 1, date: '2026-09-29', note: 'First article, written after the first request.' }
      ],
      body: [
        '## Overview',
        'Pollen grains carry the male gametes of seed plants. Their outer wall, the exine, is built largely of sporopollenin, one of the most chemically resistant materials made by living things, which is why pollen can survive for millions of years in sediments [@1].',
        '## Shape as a fingerprint',
        'The exine’s surface differs between plant groups: spines, net-like ridges, and the number and placement of the apertures through which the pollen tube grows [@1]. Because these features are often consistent within a genus or family, a trained palynologist can identify the source of a grain from its shape alone [@1].',
        '## What it is used for',
        'Pollen preserved in lake sediments and peat records how vegetation changed after the last ice age, which makes it one of the main tools for reconstructing past climates [@2]. The same identification methods are used in allergy forecasting and in forensic work.'
      ].join('\n\n'),
      sources: [
        { authors: 'Halbritter, H. et al.', year: 2018, title: 'Illustrated Pollen Terminology (2nd edition)', venue: 'Springer', oa: true },
        { authors: 'Birks, H. J. B. & Birks, H. H.', year: 1980, title: 'Quaternary Palaeoecology', venue: 'Edward Arnold' }
      ]
    },
    {
      slug: 'diatoms',
      title: 'Diatoms',
      aliases: ['diatom', 'algae', 'phytoplankton', 'plankton', 'ocean', 'silica', 'frustule'],
      state: 'warm',
      summary: 'Single-celled algae in glass shells that carry out a large share of the ocean’s photosynthesis.',
      revision: { number: 9, date: '2026-10-05' },
      checks: { citations: 'pass', drift: 'pass', lastRun: '2026-10-09' },
      history: [
        { number: 9, date: '2026-10-05', note: 'Re-verified the share of global photosynthesis against new estimates.' },
        { number: 4, date: '2026-09-12', note: 'Added global distribution from ocean sampling.' },
        { number: 1, date: '2026-08-21', note: 'First article, written after the first request.' }
      ],
      body: [
        '## Overview',
        'Diatoms are single-celled algae found in oceans, lakes and damp soils. Each cell lives inside a frustule, a shell of silica in two overlapping halves that fit together like a petri dish, patterned with pores fine enough that diatoms were long used to test the quality of microscope lenses [@1].',
        '## A large share of Earth’s photosynthesis',
        'Diatoms are estimated to carry out about a fifth of all photosynthesis on Earth and around 40 percent of primary production in the oceans [@1]. When blooms sink, they carry carbon and silica into the deep sea, tying diatoms to the ocean’s carbon and silicon cycles [@1].',
        '## Where they live',
        'Global sampling by the *Tara* Oceans expedition found diatoms throughout the sunlit layer of every ocean basin it surveyed, with a few genera such as *Chaetoceros* accounting for much of their abundance [@2].'
      ].join('\n\n'),
      sources: [
        { authors: 'Armbrust, E. V.', year: 2009, title: 'The life of diatoms in the world’s oceans', venue: 'Nature 459, 185–192' },
        { authors: 'Malviya, S. et al.', year: 2016, title: 'Insights into global diatom distribution and diversity in the world’s ocean', venue: 'Proceedings of the National Academy of Sciences 113, E1516–E1525', oa: true }
      ]
    },
    {
      slug: 'tomato-fruit-sugar-metabolism',
      title: 'Sugar metabolism in tomato fruit',
      aliases: ['tomato', 'tomatoes', 'sugar', 'sucrose', 'fruit', 'metabolism', 'solanum lycopersicum'],
      state: 'cold',
      requests: 3,
      summary: 'How tomato fruit import, store and convert sugars as they grow and ripen.'
    }
  ];

  window.EpitomeFixtures = { backgrounds, topics };
})();
