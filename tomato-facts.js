(() => {
    'use strict';

    // Random fun facts — fruit, plants, and the odd corner of the tomato
    // digital-twin research. Everything here is verified; hypotheses are
    // labeled as such. `tag`, `note`, `source`, and `url` are optional.
    const facts = [
        {
            tag: 'EVOLUTION',
            title: 'Fruit is a bribe',
            fact: 'Plants can’t walk, so they pay couriers. Sweet, colorful fruit evolved to lure animals into swallowing seeds and dropping them somewhere new—fertilizer included. Darwin ran the experiments himself, germinating seeds that had passed through birds to prove they survive the trip.',
            source: 'Darwin, On the Origin of Species (1859), ch. on dispersal'
        },
        {
            tag: 'EVOLUTION',
            title: 'Chilies are spicy on purpose—but not for birds',
            fact: 'Capsaicin fires the heat sensor in mammal mouths, but birds’ version of the receptor doesn’t respond at all. That’s the point: mammals grind seeds with their teeth, while birds swallow them whole and fly them far away. The chili picked its courier.',
            source: 'Tewksbury & Nabhan, Nature (2001)'
        },
        {
            tag: 'HYPOTHESIS',
            title: 'Avocados may be haunted by extinct giants',
            fact: 'A fruit with a giant seed wants a giant mouth. One long-standing hypothesis says avocados evolved for megafauna like giant ground sloths that swallowed them whole—animals that vanished about 10,000 years ago, leaving the avocado waiting for a partner that no longer exists.',
            source: 'Janzen & Martin, Science (1982)'
        },
        {
            tag: 'BOTANY',
            title: 'Bananas are berries. Strawberries are not.',
            fact: 'Botanically, a berry grows from a single ovary with seeds inside—so bananas, grapes, kiwis, and even watermelons qualify. Strawberries and raspberries fail the test: a strawberry is a swollen stem tip wearing its real fruits on the outside, and a raspberry is a cluster of tiny fruits holding hands.'
        },
        {
            tag: 'BOTANY',
            title: 'Every strawberry “seed” is a complete fruit',
            fact: 'Those little specks on a strawberry’s skin are achenes—each one a full, self-contained dry fruit with a seed inside. The red juicy part is technically the plant’s swollen flower base, along for the ride.'
        },
        {
            tag: 'GENOMICS',
            title: 'Strawberries carry eight copies of their genome',
            fact: 'You have two copies of your genome. The cultivated strawberry has eight—it’s an octoploid mashup of four wild species, which is part of why breeding it is such a puzzle.'
        },
        {
            tag: 'BOTANY',
            title: 'A fig is a flower turned inside out',
            fact: 'A fig isn’t a simple fruit—it’s a garden of tiny flowers blooming inside a closed pouch. Each fig species partners with its own wasp species to pollinate them. And no, the crunch isn’t wasps: the fig’s enzyme ficin dissolves its visitors completely. The crunch is seeds.'
        },
        {
            tag: 'BOTANY',
            title: 'Peanuts fruit underground',
            fact: 'A peanut isn’t a nut—it’s a legume with a strange habit. After pollination, the flower stalk bends down, drills into the soil, and the pod matures in the dark. Botanists call it geocarpy: fruiting by burial.'
        },
        {
            tag: 'BOTANY',
            title: 'Cashews grow dangling under a fake apple',
            fact: 'Each cashew hangs beneath a swollen, juicy “cashew apple.” The nut’s shell is filled with a caustic oil chemically related to poison ivy’s—which is why you will never find cashews sold in their shells.'
        },
        {
            tag: 'DISPERSAL',
            title: 'Coconuts are ocean-going seed pods',
            fact: 'A coconut’s husk is a buoyant, waterproof life raft. Coconuts can drift on ocean currents for months and still sprout on the beach where they wash up—one reason they ring tropical coastlines around the world.'
        },
        {
            tag: 'CULTURE · SINGAPORE',
            title: 'Durian is banned on the subway',
            fact: 'The durian smells so intensely that Singapore’s mass transit system explicitly bans it—there’s a durian icon right on the “no smoking, no flammables” signs. Fans call the taste heaven; the smell has been compared to gym socks and onions.'
        },
        {
            tag: 'HISTORY · NEW ZEALAND',
            title: 'The kiwifruit is a marketing rebrand',
            fact: 'It was known as the Chinese gooseberry until New Zealand exporters renamed it around 1959 after their national bird—small, brown, and fuzzy. The rebrand worked so well most people assume the fruit is a native Kiwi.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'A pineapple takes about two years',
            fact: 'A pineapple plant grows for roughly 18 to 24 months before producing its first fruit—and it makes exactly one pineapple at a time. Every pineapple you’ve eaten was the plant’s entire seasonal output.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Fresh pineapple eats you back',
            fact: 'Pineapple is packed with bromelain, an enzyme that digests protein—it’s why your tongue tingles, why it tenderizes meat, and why fresh pineapple wrecks gelatin desserts. Canned pineapple is safe: heat kills the enzyme.'
        },
        {
            tag: 'PHYSICS',
            title: 'Apples float because they’re a quarter air',
            fact: 'About 25% of an apple’s volume is air pockets between cells—which is why apples bob for the bobbing, while denser fruit like pears mostly sink.'
        },
        {
            tag: 'PHYSICS',
            title: 'Grapes make plasma in the microwave',
            fact: 'Two grapes touching in a microwave can spark a glowing blob of plasma. Physicists took it seriously and showed a grape is coincidentally the right size to trap and concentrate microwave energy at the point where the two grapes meet. Spectacular—and genuinely dangerous for your microwave.',
            source: 'Khattak et al., PNAS (2019)'
        },
        {
            tag: 'PHYSICS',
            title: 'Bananas are measurably radioactive',
            fact: 'Bananas are rich in potassium, and a sliver of natural potassium is the radioactive isotope potassium-40. The dose is so tiny that radiation safety folks jokingly use the “banana equivalent dose” to put scarier numbers in perspective.'
        },
        {
            tag: 'BOTANY',
            title: 'A banana plant is a giant herb, and every Cavendish is a clone',
            fact: 'Banana “trees” have no wood—the trunk is tightly rolled leaf bases, making the banana one of the largest herbs on Earth. And the supermarket Cavendish is seedless and sterile, so every one is propagated as a genetic copy of the same plant.'
        },
        {
            tag: 'LANGUAGE',
            title: 'The fruit named the color orange',
            fact: 'English had the fruit before it had the word for the color. “Orange” traveled from Sanskrit through Persian and Arabic with the fruit itself; before it arrived, English speakers made do with “yellow-red” (ġeolurēad).'
        },
        {
            tag: 'GENOMICS',
            title: 'Almost every citrus you know is a hybrid',
            fact: 'Genome studies show most familiar citrus descends from a few wild ancestors—mainly the mandarin, the pomelo, and the citron. The sweet orange is a mandarin–pomelo cross; the lemon traces back to citron crossed with sour orange. Citrus is one big family remix.'
        },
        {
            tag: 'CHEMISTRY',
            title: 'One bad apple really does spoil the bunch',
            fact: 'Ripening fruit releases ethylene gas, and ethylene tells nearby fruit to ripen too—so one overripe apple genuinely pushes its neighbors over the edge. The same trick works for you: bag a hard avocado with a banana and it ripens faster.'
        },
        {
            tag: 'BOTANY',
            title: 'Every corn kernel is a fruit',
            fact: 'Corn is a giant grass, and each kernel on the cob is botanically a complete fruit called a caryopsis—fruit wall and seed fused into one package. An ear of corn is hundreds of fruits arranged in rows.'
        },
        {
            tag: 'BOTANY',
            title: 'Broccoli, kale, and cabbage are the same species',
            fact: 'Broccoli, cauliflower, kale, cabbage, Brussels sprouts, and kohlrabi are all Brassica oleracea—one wild Mediterranean plant sculpted by humans into wildly different vegetables by exaggerating flowers, leaves, buds, or stems.'
        },
        {
            tag: 'BOTANY',
            title: 'Apples and peaches are roses',
            fact: 'Apples, pears, peaches, cherries, plums, apricots, strawberries, raspberries, and almonds all belong to the rose family, Rosaceae. Most of the fruit bowl is one botanical family reunion.'
        },
        {
            tag: 'BOTANY',
            title: 'Almonds are peach pits’ cousins',
            fact: 'The almond is essentially a peach relative where we eat the seed and discard the flesh—both are in the genus Prunus. Wild bitter almonds are laced with amygdalin, which releases cyanide; domestication hinged on finding sweet mutants that were safe to eat.'
        },
        {
            tag: 'HISTORY · RÉUNION',
            title: 'A 12-year-old invented vanilla farming',
            fact: 'Vanilla is the fruit of an orchid, and outside Mexico its natural pollinator is missing. In 1841, Edmond Albius—a 12-year-old enslaved boy on Réunion—invented the quick hand-pollination technique still used on virtually every vanilla farm today.'
        },
        {
            tag: 'BOTANY',
            title: 'Orchid seeds are dust that needs a fungus',
            fact: 'A single orchid seed pod can hold hundreds of thousands to millions of seeds, each nearly weightless and carrying no food reserves at all. To germinate, an orchid seed must be adopted by a soil fungus that feeds it.'
        },
        {
            tag: 'RECORDS',
            title: 'A 2,000-year-old seed grew into a tree',
            fact: 'A Judean date palm seed recovered from Masada—roughly two millennia old—was planted in 2005 and germinated. The tree was nicknamed Methuselah, and it’s alive and well.',
            source: 'Sallon et al., Science (2008)'
        },
        {
            tag: 'RECORDS',
            title: 'The smallest fruit would fit on a pinhead',
            fact: 'Watermeal (Wolffia) is the world’s smallest flowering plant—an entire plant is the size of a candy sprinkle, and a “bouquet” fits on a fingertip. It also produces the world’s smallest fruit.'
        },
        {
            tag: 'RECORDS',
            title: 'Jackfruit is the heavyweight of tree fruit',
            fact: 'The jackfruit is the largest fruit that grows on a tree—big specimens weigh more than 30 kg. The trees can’t hold them on branches, so the fruit sprouts straight from the trunk.'
        },
        {
            tag: 'RECORDS',
            title: 'Bamboo can grow almost a meter a day',
            fact: 'Some bamboo species grow around 90 cm in 24 hours—the fastest-growing plants on record. Sit next to one on a good day and it will visibly outgrow the afternoon.'
        },
        {
            tag: 'RECORDS',
            title: 'The oldest known tree predates the pyramids',
            fact: 'A Great Basin bristlecone pine in California is over 4,850 years old—it was already growing before the Great Pyramid of Giza was built, and it’s still adding rings.'
        },
        {
            tag: 'RECORDS',
            title: 'A forest in Utah is one single tree',
            fact: 'Pando is a quaking aspen clone with tens of thousands of trunks sharing one root system—genetically a single tree spread over about 40 hectares, weighing on the order of 6,000 tonnes. It’s one of the heaviest organisms known.'
        },
        {
            tag: 'BEHAVIOR',
            title: 'Venus flytraps can count',
            fact: 'A flytrap doesn’t snap on the first touch. It waits for a second trigger-hair signal within about 20 seconds before closing, and only starts pumping digestive juices after roughly five—counting to avoid wasting energy on raindrops.',
            source: 'Böhm et al., Current Biology (2016)'
        },
        {
            tag: 'BEHAVIOR',
            title: 'Grown-up sunflowers all face east',
            fact: 'Young sunflowers track the sun across the sky, swinging east to west and back overnight. Mature flowers stop and lock facing east—the morning sun warms them faster, and warm flowers attract measurably more pollinators.',
            source: 'Atamian et al., Science (2016)'
        },
        {
            tag: 'CHEMISTRY',
            title: 'Coffee plants drug their pollinators',
            fact: 'Caffeine is a natural insecticide—but coffee and citrus flowers also lace their nectar with tiny doses of it. At those levels caffeine boosts a bee’s memory of the flower’s scent, making the bee more likely to come back. Loyalty, chemically induced.',
            source: 'Wright et al., Science (2013)'
        },
        {
            tag: 'CHEMISTRY',
            title: 'One berry can make lemons taste sweet',
            fact: 'The West African miracle fruit contains miraculin, a protein that latches onto your sweet receptors and flips them on in the presence of acid. For the next hour or so, lemon juice tastes like lemonade.'
        },
        {
            tag: 'BOTANY',
            title: 'Dragon fruit comes from a night-blooming cactus',
            fact: 'Dragon fruit grows on a sprawling climbing cactus whose huge flowers open for a single night and wilt by morning—pollinated in the dark by moths and bats.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Ripe cranberries bounce',
            fact: 'Good cranberries have air chambers inside—so growers literally sort them by bouncing. Fruit that clears the barrier boards is firm and ripe; fruit that goes splat gets rejected. The air pockets are also why cranberries float in flooded bogs at harvest.'
        },
        {
            tag: 'AGRICULTURE · YORKSHIRE',
            title: 'Forced rhubarb grows fast enough to hear',
            fact: 'In Yorkshire’s “Rhubarb Triangle,” rhubarb is grown in pitch-dark heated sheds and harvested by candlelight. Starved of light, the stalks shoot up so quickly that the sheds fill with soft pops and creaks—the sound of rhubarb growing.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Lemons float. Limes sink.',
            fact: 'Drop them in water: lemons bob, limes go down. Limes are slightly denser than water and lemons slightly less—an easy bar bet you can win with a glass of water.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'You can’t taste every apple in one lifetime of snacking',
            fact: 'Around 7,500 apple varieties are grown worldwide. Trying a new one every single day would take you more than 20 years.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'One plant can grow tomatoes on top and potatoes below',
            fact: 'Tomatoes and potatoes are close nightshade relatives, so a tomato stem grafts cleanly onto a potato root. The result—sold as the “TomTato”—yields cherry tomatoes above the soil and potatoes beneath it, on a single plant.'
        },
        {
            tag: 'BOTANY',
            title: 'The corpse flower fakes a crime scene',
            fact: 'The titan arum blooms rarely—often years apart—and when it does, it heats itself up and pumps out the smell of rotting flesh to recruit carrion beetles and flesh flies as pollinators. Botanical gardens sell out tickets for the stench.'
        },
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
            bonus ? 'another fun fact' : 'fun fact';

        const tagEl = backdrop.querySelector('.tomato-fact-evidence');
        tagEl.hidden = !fact.tag;
        tagEl.textContent = fact.tag || '';

        backdrop.querySelector('.tomato-fact-title').textContent = fact.title;
        backdrop.querySelector('.tomato-fact-text').textContent = fact.fact;

        const noteEl = backdrop.querySelector('.tomato-fact-project');
        noteEl.hidden = !fact.note;
        noteEl.querySelector('span').textContent = fact.note || '';

        const paperLink = backdrop.querySelector('.tomato-fact-paper');
        paperLink.hidden = !fact.source;
        if (fact.source) {
            paperLink.textContent = `source → ${fact.source}`;
            if (fact.url) {
                paperLink.href = fact.url;
            } else {
                paperLink.removeAttribute('href');
            }
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
