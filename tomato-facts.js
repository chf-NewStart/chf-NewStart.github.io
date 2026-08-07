(() => {
    'use strict';

    // Short, source-checked facts from the tomato digital-twin project.
    // Keep each entry small enough to read in under 30 seconds.
    const facts = [
        {
            evidence: 'MEASURED · TOMATO',
            title: 'A tomato can ease off nitrate uptake within hours',
            fact: 'Across a light-to-dark experiment, internal nitrate rose from about 41 to 70 mM while net uptake fell from about 52 to 12 µmol gDW⁻¹ h⁻¹.',
            project: 'This supports negative nitrate feedback, but the paper fitted a straight line—not our proposed hyperbola.',
            paper: 'Cárdenas-Navarro et al. (1998)',
            url: 'https://doi.org/10.1093/jxb/49.321.721'
        },
        {
            evidence: 'MODEL + DATA · TOMATO',
            title: 'VYTOP contains 6,689 reactions',
            fact: 'The VYTOP model joins leaf, stem, and root metabolism while keeping xylem and phloem as separate transport compartments.',
            project: 'Our leaf model and inter-organ transport logic descend from this published scaffold.',
            paper: 'Gerlin et al. (2022)',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            evidence: 'MODEL + DATA · TOMATO',
            title: 'Glutamine dominates tomato organic xylem transport',
            fact: 'VYTOP inferred that glutamine makes up roughly 80% of organic xylem flux, consistent with the authors’ metabolomics measurements.',
            project: 'That is why glutamine is a named nitrogen currency in our transport pools.',
            paper: 'Gerlin et al. (2022), Fig. 6',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            evidence: 'EXPERIMENT DESIGN · TOMATO',
            title: 'Our N = 36 scenario came from pruning, not a universal tomato rule',
            fact: 'In the Biais experiment, plants were limited to six trusses and trusses were pruned to six developed fruits at one study site.',
            project: 'Six times six explains the model scenario; it does not prove every plant should have 36 fruits.',
            paper: 'Biais et al. (2014)',
            url: 'https://doi.org/10.1104/pp.113.231241'
        },
        {
            evidence: 'MEASURED · TOMATO',
            title: 'More fruits means a larger fruit share—but smaller individual fruits',
            fact: 'Fruit load strongly changed dry-matter partitioning, and individual fruit weight increased when fewer fruits remained on the plant.',
            project: 'This is the outside experiment we should use to test the item #6 fruit-number correction.',
            paper: 'Heuvelink (1997)',
            url: 'https://doi.org/10.1016/S0304-4238(96)00993-4'
        },
        {
            evidence: 'BIOENERGETIC MODEL · PLANT',
            title: 'One sucrose can yield about 54–55 ATP, not 30',
            fact: 'A modern plant-respiration balance estimates about 27.1–27.5 ATP per hexose unit; sucrose contains two hexose units.',
            project: 'This confirms the engine’s 30 ATP per sucrose is roughly a factor-of-two low; 60 is a rounded approximation.',
            paper: 'Amthor (2023)',
            url: 'https://doi.org/10.1093/aob/mcad075'
        },
        {
            evidence: 'BIOCHEMISTRY · PLANT',
            title: 'Reducing one nitrate takes eight electrons',
            fact: 'Nitrate reductase uses two electrons to make nitrite; nitrite reductase needs six more to make ammonium.',
            project: 'Our fruit Vnr reaction supplies one NADH—only two electrons—so its chemistry is under-costed.',
            paper: 'Scheurwater et al. (2002)',
            url: 'https://doi.org/10.1093/jxb/erf008'
        },
        {
            evidence: 'REVIEW · GENERAL PLANT',
            title: 'Sugar transport is pressure-driven, but unloading is still unresolved',
            fact: 'Phloem loading helps create the pressure difference that drives bulk flow; fleshy fruits commonly unload through an apoplasmic route.',
            project: 'This supports item #8’s transport structure, but it does not provide a tomato-fruit unloading rate.',
            paper: 'Liesche & Patrick (2017)',
            url: 'https://doi.org/10.12688/f1000research.12577.1'
        },
        {
            evidence: 'MEASURED · TOMATO',
            title: 'Tomato phloem is rich in glutamine and glutamate',
            fact: 'Pure tomato phloem sap collected by stylectomy showed glutamine and glutamate as the predominant transported free amino acids.',
            project: 'This supports using glutamine as a phloem nitrogen carrier, but it does not by itself establish C:N = 18.',
            paper: 'Valle, Boggio & Heldt (1998)',
            url: 'https://doi.org/10.1093/oxfordjournals.pcp.a029391'
        },
        {
            evidence: 'MEASURED · OTHER PLANTS',
            title: 'Phloem C:N is not one fixed number',
            fact: 'In Arabidopsis and Sinapis, organic phloem C:N changed markedly and early during the transition to flowering.',
            project: 'That makes C:N = 18 a plausible scenario parameter, not a universal measured constant.',
            paper: 'Corbesier et al. (2002)',
            url: 'https://doi.org/10.1093/pcp/pcf071'
        },
        {
            evidence: 'MECHANISTIC MODEL · GENERAL PLANT',
            title: 'Münch transport couples sugar flow to water flow',
            fact: 'A whole-plant model calculated xylem water potential, phloem sucrose concentration, and turgor together, with fruit growth depending on turgor.',
            project: 'It is a strong structural reference for items #2 and #8, but its parameters cannot be copied directly into tomato fruit.',
            paper: 'Daudet et al. (2002)',
            url: 'https://doi.org/10.1006/jtbi.2001.2473'
        },
        {
            evidence: 'MECHANISTIC MODEL · GENERAL PLANT',
            title: 'Dynamic Münch models existed before personal computers were common',
            fact: 'A 1980 model already tracked solute concentration, pressure, sap velocity, osmotic water flow, and concentration-dependent unloading over time.',
            project: 'It supports dynamic pressure-flow modelling, but not the exact feedback equation currently in our engine.',
            paper: 'Smith et al. (1980)',
            url: 'https://doi.org/10.1016/0022-5193(80)90348-3'
        },
        {
            evidence: 'CONSTRAINT MODEL · TOMATO FRUIT',
            title: 'Tomato fruit metabolism is reprogrammed as the fruit develops',
            fact: 'A constraint-based fruit model found development-dependent changes in central metabolic fluxes rather than one fixed metabolic state.',
            project: 'This published model is the foundation of our fruit FBA and its age-dependent biomass demands.',
            paper: 'Colombié et al. (2015)',
            url: 'https://doi.org/10.1111/tpj.12685'
        },
        {
            evidence: 'INDEPENDENT DATA · FIELD TOMATO',
            title: 'Fruit growth was tracked across cohorts and seasons',
            fact: 'The Rybak field study measured individual tomato fresh weight, dry weight, diameter, and dry-matter concentration through development.',
            project: 'Because it was not used to build our model, its growth trajectory is useful independent validation for item #7 and the model’s overall growth output.',
            paper: 'Rybak, Boote & Jones (2015)',
            url: 'https://doi.org/10.9734/AJEA/2015/14806'
        },
        {
            evidence: 'MODEL + DATA · WHITE CLOVER',
            title: 'Nitrogen-feedback models often use organic N, not nitrate pools',
            fact: 'A white-clover model regulated nitrate uptake using the plant’s organic-N substrate pool and a half-inhibition parameter.',
            project: 'It inspired our organic-N prototype, but it does not validate inorganic xylem feedback in tomato.',
            paper: 'Soussana et al. (2002)',
            url: 'https://doi.org/10.1093/aob/mcf161'
        }
    ];

    const millisecondsPerDay = 86400000;
    let currentIndex = 0;
    let lastFocusedElement = null;

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function dailyIndex(date = new Date()) {
        const localMidnightAsUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.floor(localMidnightAsUtc / millisecondsPerDay) % facts.length;
    }

    function buildDialog() {
        const backdrop = document.createElement('div');
        backdrop.className = 'tomato-fact-backdrop';
        backdrop.id = 'tomatoFactBackdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="tomato-fact-dialog" role="dialog" aria-modal="true"
                     aria-labelledby="tomatoFactTitle" aria-describedby="tomatoFactText">
                <button class="tomato-fact-close" type="button" aria-label="Close tomato fact">×</button>
                <p class="tomato-fact-kicker"></p>
                <span class="tomato-fact-evidence"></span>
                <h2 class="tomato-fact-title" id="tomatoFactTitle"></h2>
                <p class="tomato-fact-text" id="tomatoFactText"></p>
                <p class="tomato-fact-project"><strong>Why it matters here:</strong> <span></span></p>
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
            currentIndex = (currentIndex + 1) % facts.length;
            renderFact(backdrop, currentIndex, true);
        });
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeDialog();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !backdrop.hidden) closeDialog();
        });
        return backdrop;
    }

    function renderFact(backdrop, index, bonus = false) {
        const fact = facts[index];
        backdrop.querySelector('.tomato-fact-kicker').textContent =
            `${bonus ? 'bonus fact' : "today's tomato fact"} · ${index + 1}/${facts.length}`;
        backdrop.querySelector('.tomato-fact-evidence').textContent = fact.evidence;
        backdrop.querySelector('.tomato-fact-title').textContent = fact.title;
        backdrop.querySelector('.tomato-fact-text').textContent = fact.fact;
        backdrop.querySelector('.tomato-fact-project span').textContent = fact.project;
        const paperLink = backdrop.querySelector('.tomato-fact-paper');
        paperLink.href = fact.url;
        paperLink.textContent = `read the paper → ${fact.paper}`;
    }

    function openDialog({ automatic = false } = {}) {
        const backdrop = document.getElementById('tomatoFactBackdrop') || buildDialog();
        currentIndex = dailyIndex();
        renderFact(backdrop, currentIndex);
        lastFocusedElement = document.activeElement;
        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';
        backdrop.querySelector('.tomato-fact-close').focus();
        if (automatic) localStorage.setItem('tomatoFactLastAuto', localDateKey());
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

        if (localStorage.getItem('tomatoFactLastAuto') !== localDateKey()) {
            window.setTimeout(() => openDialog({ automatic: true }), 1200);
        }
    });
})();
