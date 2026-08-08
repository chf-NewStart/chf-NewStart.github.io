(() => {
    'use strict';

    // Random tomato fun facts. A mix of general tomato trivia and the
    // more surprising corners of the tomato digital-twin research.
    // `tag`, `note`, `source`, and `url` are all optional per fact.
    const facts = [
        {
            tag: 'LAW · USA',
            title: 'The US Supreme Court ruled the tomato is a vegetable',
            fact: 'Botanically a tomato is a fruit—a berry, even—but in Nix v. Hedden (1893) the Supreme Court unanimously declared it a vegetable, because that is how people eat it. The case was about import tariffs on vegetables.',
            source: 'Nix v. Hedden, 149 U.S. 304 (1893)',
            url: 'https://supreme.justia.com/cases/federal/us/149/304/'
        },
        {
            tag: 'GENOMICS',
            title: 'A tomato has more genes than you do',
            fact: 'The tomato genome, sequenced in 2012, carries roughly 35,000 protein-coding genes. Humans get by with about 20,000.',
            source: 'The Tomato Genome Consortium, Nature (2012)',
            url: 'https://doi.org/10.1038/nature11119'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Your fridge is murdering your tomatoes',
            fact: 'Chilling tomatoes below about 12 °C switches off the genes that make their flavor volatiles—and much of the flavor never comes back after rewarming. Keep them on the counter.',
            source: 'Zhang et al., PNAS (2016)',
            url: 'https://doi.org/10.1073/pnas.1613910113'
        },
        {
            tag: 'ANATOMY',
            title: 'A tomato is basically water with ambitions',
            fact: 'A ripe tomato is roughly 95% water. Almost everything you taste—sugars, acids, and dozens of aroma compounds—lives in the remaining ~5%.'
        },
        {
            tag: 'CULTURE · SPAIN',
            title: 'A Spanish town holds a yearly tomato war',
            fact: 'Every August, Buñol in Spain hosts La Tomatina: tens of thousands of people pelting each other with well over a hundred tonnes of overripe tomatoes. It started with a street brawl in 1945.'
        },
        {
            tag: 'SPACE',
            title: 'NASA lost a space tomato for eight months',
            fact: 'One of the first tomatoes grown aboard the International Space Station went missing in 2023 after astronaut Frank Rubio harvested it. He was jokingly accused of eating it—until the shriveled tomato was found eight months later, clearing his name.'
        },
        {
            tag: 'ORIGINS · ANDES',
            title: 'Wild tomatoes are the size of peas',
            fact: 'The tomato’s wild ancestors from the Andes, like the currant tomato Solanum pimpinellifolium, bear fruit about a centimeter across. Thousands of years of selection turned that into the beefsteak.'
        },
        {
            tag: 'HISTORY · EUROPE',
            title: 'Europeans once treated tomatoes as poison',
            fact: 'As a nightshade relative, the tomato spent a long stretch of European history as a suspicious ornamental—nicknamed the “poison apple”—before it finally won a place on the dinner table.'
        },
        {
            tag: 'RECORDS',
            title: 'The heaviest tomato weighed as much as a bowling ball',
            fact: 'The Guinness world record for heaviest tomato stands at about 5.28 kg (11 lb 14 oz), grown in Washington state in 2020. A regulation bowling ball can legally weigh less.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'Humanity grows a staggering pile of tomatoes',
            fact: 'The world produces on the order of 190 million tonnes of tomatoes a year—one of the most-grown fruits on Earth—with China alone accounting for roughly a third.'
        },
        {
            tag: 'RESEARCH · SAP',
            title: 'Scientists tap tomato sap by cutting an aphid’s straw mid-sip',
            fact: 'To sample pure phloem sap, researchers let an aphid plug its needle-like mouthpart into a tomato stem, then sever the mouthpart. Sap keeps flowing out of the stump for hours. The verdict: tomato phloem is loaded with glutamine and glutamate.',
            note: 'This is why glutamine shows up as a nitrogen currency in my tomato digital twin.',
            source: 'Valle, Boggio & Heldt (1998)',
            url: 'https://doi.org/10.1093/oxfordjournals.pcp.a029391'
        },
        {
            tag: 'RESEARCH · ROOTS',
            title: 'Tomatoes throttle their own fertilizer intake',
            fact: 'When researchers plunged tomato plants into darkness, the roots dialed nitrate uptake down from about 52 to 12 µmol per gram per hour within hours—the plant sensed it had enough stockpiled and eased off.',
            note: 'My model treats this self-regulation as a feedback loop instead of a straight line.',
            source: 'Cárdenas-Navarro et al. (1998)',
            url: 'https://doi.org/10.1093/jxb/49.321.721'
        },
        {
            tag: 'RESEARCH · MODELING',
            title: 'There is a virtual tomato with 6,689 chemical reactions',
            fact: 'The VYTOP model stitches together leaf, stem, and root metabolism—6,689 reactions in all—and even gives the plant’s internal plumbing, xylem and phloem, their own compartments.',
            note: 'My digital twin’s leaf and transport logic descend from this scaffold.',
            source: 'Gerlin et al. (2022)',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            tag: 'RESEARCH · TRANSPORT',
            title: 'Tomatoes ship nitrogen almost entirely as glutamine',
            fact: 'Modeling backed by metabolomics suggests glutamine makes up roughly 80% of the organic cargo riding up a tomato’s xylem. One molecule dominates the whole freight line.',
            source: 'Gerlin et al. (2022)',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            tag: 'RESEARCH · HORTICULTURE',
            title: 'Want giant tomatoes? Pick some off',
            fact: 'Classic greenhouse experiments show that the fewer fruits a tomato plant carries, the bigger each remaining fruit grows—the plant reroutes its sugar budget to the survivors. Competition is real, even on a vine.',
            source: 'Heuvelink (1997)',
            url: 'https://doi.org/10.1016/S0304-4238(96)00993-4'
        },
        {
            tag: 'RESEARCH · ENERGY',
            title: 'One sucrose molecule is worth about 54 ATP',
            fact: 'Modern plant-respiration accounting puts the energy yield near 27 ATP per hexose—so a sucrose, with two hexose units, buys the plant roughly 54 ATP. Older textbook numbers ran almost a factor of two lower.',
            note: 'Finding this out forced me to re-price every energy budget in my model.',
            source: 'Amthor (2023)',
            url: 'https://doi.org/10.1093/aob/mcad075'
        },
        {
            tag: 'RESEARCH · CHEMISTRY',
            title: 'Turning fertilizer into protein costs eight electrons a pop',
            fact: 'Reducing a single nitrate ion to ammonium takes eight electrons: two to reach nitrite, six more to finish the job. Nitrogen is expensive, which is why plants ration it so carefully.',
            source: 'Scheurwater et al. (2002)',
            url: 'https://doi.org/10.1093/jxb/erf008'
        },
        {
            tag: 'RESEARCH · PLUMBING',
            title: 'Sugar rides a pressure wave through the plant',
            fact: 'Sugar doesn’t diffuse lazily through a tomato plant—loading it into the phloem builds pressure that drives bulk flow toward the fruit, like water through a squeezed hose. How the fruit unloads it at the far end is still being argued about.',
            source: 'Liesche & Patrick (2017)',
            url: 'https://doi.org/10.12688/f1000research.12577.1'
        },
        {
            tag: 'RESEARCH · DEVELOPMENT',
            title: 'A tomato fruit rewires its own metabolism as it grows',
            fact: 'Constraint-based modeling shows a developing tomato fruit doesn’t run one fixed metabolic program—its central fluxes get reprogrammed stage by stage from green marble to ripe fruit.',
            note: 'This model is the foundation of the fruit inside my digital twin.',
            source: 'Colombié et al. (2015)',
            url: 'https://doi.org/10.1111/tpj.12685'
        }
    ];

    const LAST_INDEX_KEY = 'tomatoFunFactLastIndex';
    const LAST_AUTO_KEY = 'tomatoFactLastAuto';
    let currentIndex = -1;
    let lastFocusedElement = null;
    let shuffledOrder = [];
    let shufflePosition = 0;

    function reshuffle() {
        shuffledOrder = facts.map((_, i) => i);
        for (let i = shuffledOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
        }
        shufflePosition = 0;
    }

    // Walks a shuffled deck so every fact appears before any repeats, and
    // never shows the same fact twice in a row (even across reshuffles).
    function nextRandomIndex(avoid) {
        for (let attempts = 0; attempts < 2; attempts++) {
            if (shufflePosition >= shuffledOrder.length) reshuffle();
            const index = shuffledOrder[shufflePosition++];
            if (index !== avoid || facts.length === 1) return index;
        }
        return shuffledOrder[shufflePosition - 1];
    }

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function buildDialog() {
        const backdrop = document.createElement('div');
        backdrop.className = 'tomato-fact-backdrop';
        backdrop.id = 'tomatoFactBackdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="tomato-fact-dialog" role="dialog" aria-modal="true"
                     aria-labelledby="tomatoFactTitle" aria-describedby="tomatoFactText">
                <button class="tomato-fact-close" type="button" aria-label="Close fun fact">×</button>
                <p class="tomato-fact-kicker"></p>
                <span class="tomato-fact-evidence"></span>
                <h2 class="tomato-fact-title" id="tomatoFactTitle"></h2>
                <p class="tomato-fact-text" id="tomatoFactText"></p>
                <p class="tomato-fact-project"><strong>Why I care:</strong> <span></span></p>
                <a class="tomato-fact-paper" target="_blank" rel="noopener noreferrer"></a>
                <div class="tomato-fact-actions">
                    <button class="tomato-fact-button" type="button" data-action="another">show another</button>
                    <button class="tomato-fact-button primary" type="button" data-action="close">got it</button>
                </div>
            </section>`;
        document.body.appendChild(backdrop);

        backdrop.querySelector('.tomato-fact-close').addEventListener('click', closeDialog);
        backdrop.querySelector('[data-action="close"]').addEventListener('click', closeDialog);
        backdrop.querySelector('[data-action="another"]').addEventListener('click', () => {
            showRandomFact(backdrop, true);
        });
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeDialog();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !backdrop.hidden) closeDialog();
        });
        return backdrop;
    }

    function showRandomFact(backdrop, bonus = false) {
        const avoid = currentIndex >= 0
            ? currentIndex
            : Number(localStorage.getItem(LAST_INDEX_KEY));
        currentIndex = nextRandomIndex(avoid);
        localStorage.setItem(LAST_INDEX_KEY, String(currentIndex));

        const fact = facts[currentIndex];
        backdrop.querySelector('.tomato-fact-kicker').textContent =
            bonus ? 'another tomato fun fact' : 'tomato fun fact';

        const tagEl = backdrop.querySelector('.tomato-fact-evidence');
        tagEl.hidden = !fact.tag;
        tagEl.textContent = fact.tag || '';

        backdrop.querySelector('.tomato-fact-title').textContent = fact.title;
        backdrop.querySelector('.tomato-fact-text').textContent = fact.fact;

        const noteEl = backdrop.querySelector('.tomato-fact-project');
        noteEl.hidden = !fact.note;
        noteEl.querySelector('span').textContent = fact.note || '';

        const paperLink = backdrop.querySelector('.tomato-fact-paper');
        paperLink.hidden = !fact.url;
        if (fact.url) {
            paperLink.href = fact.url;
            paperLink.textContent = `source → ${fact.source}`;
        }
    }

    function openDialog({ automatic = false } = {}) {
        const backdrop = document.getElementById('tomatoFactBackdrop') || buildDialog();
        showRandomFact(backdrop);
        lastFocusedElement = document.activeElement;
        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';
        backdrop.querySelector('.tomato-fact-close').focus();
        if (automatic) localStorage.setItem(LAST_AUTO_KEY, localDateKey());
    }

    function closeDialog() {
        const backdrop = document.getElementById('tomatoFactBackdrop');
        if (!backdrop) return;
        backdrop.hidden = true;
        document.body.style.overflow = '';
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildDialog();
        const tomatoButton = document.getElementById('tomatoToggle');
        if (tomatoButton) {
            tomatoButton.addEventListener('click', (event) => {
                if (!event.shiftKey) openDialog();
            });
        }

        if (localStorage.getItem(LAST_AUTO_KEY) !== localDateKey()) {
            window.setTimeout(() => openDialog({ automatic: true }), 1200);
        }
    });
})();
