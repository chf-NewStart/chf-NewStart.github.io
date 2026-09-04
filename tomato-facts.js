(() => {
    'use strict';

    // Random fun facts — fruit, plants, and the odd corner of the tomato
    // digital-twin research. Everything here is verified; hypotheses and
    // lore are labeled as such. Optional fields per fact:
    //   tag     small badge above the title
    //   quote   verbatim quotation, shown in the details panel
    //   detail  extra context, shown in the details panel
    //   note    personal "why I care" line, shown in the details panel
    //   source  citation text; url makes it a link
    //
    // NEWEST FIRST: facts[0] is the featured fact — each visitor sees it
    // once, the first time they open the popup after it lands, before the
    // rotation goes random. The daily fact-hunter job prepends exactly one
    // new, verified, non-duplicate fact at the top of this array.
    const facts = [
        {
            tag: "KITCHEN SCIENCE",
            title: "Kiwifruit dissolves meat, gelatin, and your tongue’s patience",
            fact: "Kiwis carry actinidin, a protein-digesting enzyme in the same job family as pineapple’s bromelain. It tenderizes meat in marinades, keeps gelatin from setting, and gives your tongue that prickly feeling after a few too many.",
            detail: "Cooks exploit it deliberately: a little puréed kiwi is a classic fast tenderizer for tough cuts. Heat denatures the enzyme, which is why cooked or canned kiwi behaves itself in desserts."
        },
        {
            tag: "HISTORY",
            title: "Ancient athletes were crowned with celery",
            fact: "Winners at the ancient Nemean Games in Greece received wreaths of wild celery — a plant with funerary associations, worn as a crown of victory. Olympia had olive, Delphi had laurel, Nemea had celery.",
            detail: "The Isthmian Games near Corinth also used celery crowns before switching to pine. A vegetable crown sounds comic now, but these garlands outranked any prize money in prestige."
        },
        {
            tag: "FOOD SCIENCE",
            title: "White chocolate contains no cocoa solids",
            fact: "White chocolate is cocoa butter, sugar, and milk — all of the cacao bean’s fat, none of its dark solids. That’s why it’s ivory-colored and why it tastes of dairy and vanilla rather than of chocolate itself.",
            detail: "Regulations in many countries set minimums (around 20% cocoa butter) before the label “white chocolate” is allowed. The brown flavor compounds live in the roasted solids, which white chocolate leaves out entirely."
        },
        {
            tag: "RECORDS",
            title: "A 400-year-old grapevine still produces a harvest",
            fact: "The Old Vine in Maribor, Slovenia, has been growing against the same house for more than four centuries — through sieges, fires, and phylloxera — and its grapes are still picked each year at a city festival.",
            detail: "The wine, a dark local variety, is bottled in tiny amounts and given as a protocol gift. Guinness certifies it as the world’s oldest fruit-bearing grapevine."
        },
        {
            tag: "MATH · BOTANY",
            title: "Romanesco is a vegetable-shaped fractal",
            fact: "Romanesco’s spiraling cones repeat themselves at smaller and smaller scales — a natural fractal you can buy at a market. It’s a cultivar of the same species as broccoli and cauliflower, Brassica oleracea.",
            detail: "Researchers modeling its genetics showed the spirals come from buds that try to become flowers, fail, and instead spawn more bud-making shoots — a growth program stuck in a loop, printing cones of cones of cones.",
            source: "Azpeitia et al., Science (2021)"
        },
        {
            tag: "BOTANY",
            title: "A sunflower is hundreds of flowers in a trench coat",
            fact: "The big “flower” is an inflorescence: the outer petals are individual ray florets, and the dark center is packed with hundreds of tiny disc florets, each one a complete flower that becomes a single seed.",
            detail: "The florets are laid down in interlocking spirals whose counts land on Fibonacci numbers — commonly 34 and 55, or 55 and 89 — the packing pattern that fits the most florets into the disc."
        },
        {
            tag: "BOTANY",
            title: "Bananas curve because they grow against gravity",
            fact: "Banana fruit start out pointing down, then bend upward as they grow, reaching for light past the plant’s huge leaves. The curve is negative gravitropism — growth steered against gravity — frozen into the fruit’s shape.",
            detail: "The whole hand of bananas does it together, which is why they fan upward around the stalk. Straight bananas mostly mean the fruit grew unobstructed toward light from the start."
        },
        {
            tag: "EARTH",
            title: "The Sahara fertilizes the Amazon",
            fact: "Satellites tracking dust plumes show tens of millions of tonnes of Saharan dust crossing the Atlantic every year — and the phosphorus riding along helps replenish what Amazon rains keep washing out of the soil.",
            detail: "Much of the richest dust comes from the Bodélé Depression in Chad, an ancient dried lakebed of ground-up mineral sediment. One continent’s dead lake feeds another continent’s rainforest."
        },
        {
            tag: "RECORDS",
            title: "The biggest tree weighs more than a fleet of blue whales",
            fact: "General Sherman, a giant sequoia in California, is the largest single-stemmed tree on Earth by volume — a trunk of roughly 1,500 cubic meters, still adding wood every year after some 2,000+ years.",
            detail: "Sequoias are fire-adapted: their thick spongy bark shrugs off flames, and heat helps open their cones. The species survives natural burns that kill the competition around it."
        },
        {
            tag: "BIOLOGY",
            title: "Lichens have survived open space",
            fact: "Lichens — a working partnership between a fungus and an alga — were strapped to the outside of a space capsule in European Space Agency experiments, exposed to vacuum, radiation, and temperature swings, and revived on return to Earth.",
            detail: "The trick is their talent for total shutdown: dried out, metabolism near zero, they simply wait. The same toughness lets lichens live on bare rock from Antarctica to desert mountaintops, slowly making soil for everything else."
        },
        {
            tag: "RECORDS",
            title: "One of Earth’s largest organisms is a fungus",
            fact: "A single honey fungus (Armillaria) in Oregon’s Blue Mountains spreads through roughly nine square kilometers of forest soil — one genetic individual, likely thousands of years old, quietly eating tree roots.",
            detail: "It was mapped by sampling and genotyping across the Malheur National Forest: the far-flung samples kept coming back as the same individual. Most of the organism is underground filaments; the mushrooms you’d see are just its fruit."
        },
        {
            tag: "BIOLOGY",
            title: "Mushrooms are closer kin to you than to plants",
            fact: "On the tree of life, fungi and animals share a more recent common ancestor than either does with plants. Fungi don’t photosynthesize, they digest; and their cell walls are built of chitin — the same material as insect shells.",
            detail: "That kinship is why fungal infections are hard to treat: drugs that hurt fungal cells often hurt ours too. Plants split off earlier and went the sunlight route; fungi, like us, eat."
        },
        {
            tag: "GENOMICS",
            title: "Bell peppers are chilies with a broken heat switch",
            fact: "Sweet bell peppers are the same species as many hot chilies — they just carry a recessive mutation that disables capsaicin production entirely. Zero heat, by genetics rather than by breeding out flavor.",
            detail: "The Scoville scale that ranks chili heat began in 1912 as a human taste test: how much sugar water it took to dilute an extract until tasters felt no burn. Bell peppers score an honest zero."
        },
        {
            tag: "BOTANY",
            title: "Corn cobs almost always have an even number of rows",
            fact: "Count the rows on an ear of corn: 12, 14, 16 — almost always even. The kernel rows arise from paired flower spikelets, so they’re laid down two at a time from the start.",
            detail: "Row number is largely genetic, and breeders track it as a yield trait. Odd-rowed ears exist but are rare enough that finding one is corn-maze-trivia territory."
        },
        {
            tag: "PHYSICS",
            title: "A popcorn kernel is a tiny pressure cooker",
            fact: "Each kernel is a sealed caryopsis with a moist starchy core. Heat superheats that moisture well past boiling until, around 180 °C, the hull fails and the starch flash-expands into foam — the pop is a miniature steam explosion.",
            detail: "Moisture is everything: kernels pop best near 14% water content. Too dry and there’s no steam to burst the hull; too wet and it fails early into a dense, chewy pop. The leftover “old maids” at the bowl’s bottom are usually kernels with cracked hulls that leaked their pressure."
        },
        {
            tag: "CHEMISTRY",
            title: "Garlic breath comes from your lungs, not your mouth",
            fact: "One garlic compound — allyl methyl sulfide — isn’t broken down by digestion. It rides your bloodstream to the lungs and exhales itself for hours, which is why brushing, mouthwash, and gum never fully fix garlic breath.",
            detail: "The same bloodstream route is why heavy garlic can scent sweat and even breast milk. Studies suggest raw apple or mint leaves help degrade the sulfides — the folk remedies had a point."
        },
        {
            tag: "CHEMISTRY",
            title: "Onions make you cry with a purpose-built gas",
            fact: "Slicing an onion breaks cells and mixes enzymes with sulfur compounds, producing a volatile gas that drifts up and stings your eyes into watering. It’s a chemical defense — you’re being maced by a bulb.",
            detail: "The tear-maker is called syn-propanethial S-oxide. Chilling the onion first slows the enzymes, and a sharp knife crushes fewer cells — both genuinely reduce the crying."
        },
        {
            tag: "HISTORY",
            title: "Baby carrots were invented to rescue ugly ones",
            fact: "In 1986, California farmer Mike Yurosek got tired of discarding truckloads of broken and crooked carrots, so he whittled them into smooth little snack-size pieces. The “baby carrot” was born from waste-cutting, not breeding.",
            detail: "The invention roughly doubled American carrot consumption within a decade — a marketing lesson carved directly into a vegetable."
        },
        {
            tag: "BOTANY",
            title: "Every true tea comes from one species",
            fact: "Green, black, oolong, white, and pu-erh tea are all leaves of a single plant, Camellia sinensis. The differences come from processing — mainly how far the leaves are allowed to oxidize before drying.",
            detail: "Herbal “teas” like chamomile, peppermint, and rooibos contain no tea plant at all; strictly speaking they’re infusions, or tisanes. Green tea skips oxidation almost entirely; black tea embraces it fully."
        },
        {
            tag: "PHYSICS",
            title: "Pistachios can set themselves on fire",
            fact: "Packed in bulk, oily pistachios can self-heat: fat oxidation releases warmth, the pile insulates itself, and the temperature can climb toward spontaneous combustion. Maritime cargo rules treat them as a self-heating hazard.",
            detail: "That’s why international shipping codes set limits on how pistachios are stowed and ventilated at sea. The same self-heating chemistry is behind hay-barn fires and oily-rag fires in workshops."
        },
        {
            tag: "KITCHEN SCIENCE",
            title: "Black, white, and green pepper are the same berry",
            fact: "All three come from the same vine, Piper nigrum. Green peppercorns are picked unripe, black ones are unripe and sun-dried until the skin darkens and wrinkles, and white ones are ripened and soaked to strip the skin off.",
            detail: "Pink “peppercorns” are the impostor at the party — they’re berries of an unrelated South American tree that happen to look the part."
        },
        {
            tag: "BOTANY",
            title: "Nutmeg and mace come from the same fruit",
            fact: "Crack open a nutmeg fruit and you get two spices at once: the nutmeg is the seed, and mace is the lacy scarlet aril wrapped around it. One harvest, two jars on the spice rack.",
            detail: "In large doses nutmeg’s myristicin is genuinely toxic, which is one reason it stays a pinch-at-a-time spice. Historically, control of the tiny nutmeg-growing Banda Islands was contested by entire empires."
        },
        {
            tag: "BOTANY",
            title: "Chocolate grows straight out of tree trunks",
            fact: "Cacao pods sprout directly from the trunk and thick branches of the cacao tree — the same trunk-fruiting habit (cauliflory) as jackfruit. The Aztecs valued the beans enough to use them as actual currency.",
            detail: "The flowers are pollinated not by bees but by midges only a couple of millimeters long, which breed in the damp leaf litter of shaded plantations. No midges, no chocolate."
        },
        {
            tag: "BOTANY",
            title: "A coffee bean is the pit of a fruit",
            fact: "Coffee “beans” are the seeds of a small red fruit called a coffee cherry — normally two seeds per cherry, facing each other flat side to flat side. Coffee is, botanically speaking, a fruit-pit beverage.",
            detail: "When only one seed develops it grows rounder and is sold as a “peaberry,” prized by some roasters. The cherry’s thin, sweet pulp is edible too, and is dried into a tea-like drink called cascara."
        },
        {
            tag: "KITCHEN SCIENCE",
            title: "You’ve probably never eaten real wasabi",
            fact: "Most “wasabi” served outside Japan — and plenty inside — is horseradish paste with mustard and green coloring. Real wasabi is a finicky semi-aquatic plant, and its freshly grated heat starts fading within about 15 minutes.",
            detail: "That evaporating punch is why real wasabi is grated to order on sharkskin-textured graters at high-end sushi counters. The plant demands cool, running water and years of patience, making it one of the hardest crops to farm."
        },
        {
            tag: 'RESEARCH · PLANT PLUMBING',
            title: 'Scientists measured the pressure behind phloem flow',
            fact: 'In intact morning-glory vines, source phloem pressure averaged 1.08 MPa while pressure near the root sink averaged 0.59 MPa. Sap moved at about 0.44 metres per hour—the pressure difference was sufficient to drive it.',
            detail: 'The experiment combined aphid-stylet pressure measurements, fluorescent tracers, and anatomical measurements. Longer vines also built more conductive sieve tubes, helping preserve transport over distance.',
            note: 'This supports the pressure-driven xylem–phloem coupling in my model and the form J_suc = Q_p·C_p, but it does not give a tomato-fruit Q_p.',
            source: 'Knoblauch et al. (2016)',
            url: 'https://doi.org/10.7554/eLife.15341'
        },
        {
            tag: "AGRICULTURE",
            title: "Saffron costs more than silver for a reason",
            fact: "Saffron is the hand-picked stigmas of a crocus flower — three tiny threads per bloom. It takes on the order of 150,000 flowers, all harvested by hand at dawn, to make a single kilogram of the world’s most expensive spice.",
            detail: "The saffron crocus is also sterile — a triploid that can’t set seed — so every plant on Earth is propagated by hand from corms, making the whole crop one enormous clone lineage."
        },
        {
            tag: "HISTORY",
            title: "Carrots weren’t originally orange",
            fact: "The carrot’s early domesticated forms in Central Asia were purple, yellow, and white. Orange carrots only came to dominate after Dutch growers in the 16th–17th centuries bred and popularized them across Europe.",
            detail: "The story that the Dutch bred them orange to honor the House of Orange is charming but undocumented — historians treat it as legend. Purple “heritage” carrots in fancy groceries are actually the throwback originals."
        },
        {
            tag: "FOOD SCIENCE",
            title: "Honey never spoils",
            fact: "Archaeologists have opened pots of honey thousands of years old — including from Egyptian tombs — and found it still edible. Honey is too dry, too acidic, and too peroxide-laced for microbes to survive in it.",
            detail: "Bees engineer this on purpose: they fan nectar with their wings until it drops to roughly 17–18% water, and an enzyme they add produces small amounts of hydrogen peroxide. Sealed against moisture, honey is effectively a preserved food forever."
        },
        {
            tag: 'EVOLUTION',
            title: 'Fruit is a bribe',
            fact: 'Plants can’t walk, so they pay couriers. Sweet, colorful fruit evolved to lure animals into swallowing seeds and dropping them somewhere new—fertilizer included. Darwin ran the experiments himself, germinating seeds that had passed through birds to prove they survive the trip.',
            detail: 'In the Origin’s chapters on dispersal, Darwin soaked seeds in seawater for weeks, fed them to fish and birds, and raised plants from seeds recovered from droppings and pellets. From three tablespoonfuls of pond mud he grew 537 plants—his point being that seeds travel in far more ways than anyone assumed.',
            source: 'Darwin, On the Origin of Species (1859), ch. 12',
            url: 'https://darwin-online.org.uk/Variorum/1859/1859-362-c-1861.html'
        },
        {
            tag: 'EVOLUTION',
            title: 'Chilies are spicy on purpose—but not for birds',
            fact: 'Capsaicin fires the heat sensor in mammal mouths, but birds’ version of the receptor doesn’t respond at all. That’s the point: mammals grind seeds with their teeth, while birds swallow them whole and fly them far away. The chili picked its courier.',
            detail: 'In field and lab tests with wild chilies, desert rodents refused the spicy fruit while curve-billed thrashers ate it freely—and seeds that passed through the birds germinated just fine. Capsaicin triggers the mammalian TRPV1 heat receptor; the bird version of the channel simply doesn’t bind it.',
            source: 'Tewksbury & Nabhan, Nature (2001)',
            url: 'https://doi.org/10.1038/35086653'
        },
        {
            tag: 'HYPOTHESIS',
            title: 'Avocados may be haunted by extinct giants',
            fact: 'A fruit with a giant seed wants a giant mouth. One long-standing hypothesis says avocados evolved for megafauna like giant ground sloths that swallowed them whole—animals that vanished about 10,000 years ago, leaving the avocado waiting for a partner that no longer exists.',
            detail: 'The idea comes from Janzen and Martin’s 1982 paper, wonderfully titled “Neotropical Anachronisms: The Fruits the Gomphotheres Ate.” Nothing left in the avocado’s native range can swallow one whole—humans became its replacement dispersal partner, and we’ve done a spectacular job.',
            source: 'Janzen & Martin, Science (1982)',
            url: 'https://doi.org/10.1126/science.215.4528.19'
        },
        {
            tag: 'BOTANY',
            title: 'Bananas are berries. Strawberries are not.',
            fact: 'Botanically, a berry grows from a single ovary with seeds inside—so bananas, grapes, kiwis, and even watermelons qualify. Strawberries and raspberries fail the test: a strawberry is a swollen stem tip wearing its real fruits on the outside, and a raspberry is a cluster of tiny fruits holding hands.',
            detail: 'The berry checklist: fleshy fruit, from a single ovary, seeds embedded in the flesh. Tomatoes, cucumbers, eggplants, and chili peppers all pass. Cherries and peaches fail—one stony seed makes them drupes—and mulberries fail as fused clusters of many flowers.'
        },
        {
            tag: 'BOTANY',
            title: 'Every strawberry “seed” is a complete fruit',
            fact: 'Those little specks on a strawberry’s skin are achenes—each one a full, self-contained dry fruit with a seed inside. The red juicy part is technically the plant’s swollen flower base, along for the ride.',
            detail: 'A typical strawberry carries about 200 achenes. Since those specks are the true fruits, the “berry” you bite into is classed as an accessory fruit: the flower’s receptacle, puffed up into dessert.'
        },
        {
            tag: 'GENOMICS',
            title: 'Strawberries carry eight copies of their genome',
            fact: 'You have two copies of your genome. The cultivated strawberry has eight—it’s an octoploid mashup of four wild species, which is part of why breeding it is such a puzzle.',
            detail: 'The garden strawberry, Fragaria × ananassa, began as an accidental 18th-century cross in European gardens between two octoploid American species—one shipped from Chile, one from eastern North America.'
        },
        {
            tag: 'BOTANY',
            title: 'A fig is a flower turned inside out',
            fact: 'A fig isn’t a simple fruit—it’s a garden of tiny flowers blooming inside a closed pouch. Each fig species partners with its own wasp species to pollinate them. And no, the crunch isn’t wasps: the fig’s enzyme ficin dissolves its visitors completely. The crunch is seeds.',
            detail: 'The fig–wasp partnership is one of biology’s oldest mutualisms, tens of millions of years running. If wasps bother you anyway, relax: most supermarket figs are parthenocarpic varieties that ripen with no pollination—and no visitors—at all.'
        },
        {
            tag: 'BOTANY',
            title: 'Peanuts fruit underground',
            fact: 'A peanut isn’t a nut—it’s a legume with a strange habit. After pollination, the flower stalk bends down, drills into the soil, and the pod matures in the dark. Botanists call it geocarpy: fruiting by burial.',
            detail: 'The burrowing stalk is called a peg. If a peg can’t reach the soil, its pod simply never develops—which is why loose, sandy ground makes good peanut country.'
        },
        {
            tag: 'BOTANY',
            title: 'Cashews grow dangling under a fake apple',
            fact: 'Each cashew hangs beneath a swollen, juicy “cashew apple.” The nut’s shell is filled with a caustic oil chemically related to poison ivy’s—which is why you will never find cashews sold in their shells.',
            detail: 'The shell oil’s anacardic acids blister skin, and even the roasting smoke is irritating—processing is done with real care. The cashew apple itself is perfectly edible and widely juiced in Brazil, where the tree is native.'
        },
        {
            tag: 'DISPERSAL',
            title: 'Coconuts are ocean-going seed pods',
            fact: 'A coconut’s husk is a buoyant, waterproof life raft. Coconuts can drift on ocean currents for months and still sprout on the beach where they wash up—one reason they ring tropical coastlines around the world.',
            detail: 'The flotation comes from the husk’s air-filled fibers. Genetics adds a twist: coconut DNA splits into two ancient lineages, showing the palm spread both by floating and by ancient seafarers who carried it deliberately.'
        },
        {
            tag: 'CULTURE · SINGAPORE',
            title: 'Durian is banned on the subway',
            fact: 'The durian smells so intensely that Singapore’s mass transit system explicitly bans it—there’s a durian icon right on the “no smoking, no flammables” signs. Fans call the taste heaven; the smell has been compared to gym socks and onions.',
            detail: 'Flavor chemists who dissected the aroma found dozens of active odor compounds, including ones reminiscent of rotten onion, cabbage, and sulfur. Remarkably, no single compound smells like durian—only the mixture does.'
        },
        {
            tag: 'HISTORY · NEW ZEALAND',
            title: 'The kiwifruit is a marketing rebrand',
            fact: 'It was known as the Chinese gooseberry until New Zealand exporters renamed it around 1959 after their national bird—small, brown, and fuzzy. The rebrand worked so well most people assume the fruit is a native Kiwi.',
            detail: 'Exporters even flirted with the name “melonette” first. In China, where the vine actually comes from, the fruit is called míhóutáo—“macaque peach”—and China remains one of its biggest producers.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'A pineapple takes about two years',
            fact: 'A pineapple plant grows for roughly 18 to 24 months before producing its first fruit—and it makes exactly one pineapple at a time. Every pineapple you’ve eaten was the plant’s entire seasonal output.',
            detail: 'After the first harvest the plant can “ratoon”—fruit again from side shoots, a little faster each round. Commercial growers synchronize whole fields by triggering flowering chemically with ethylene-releasing compounds.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Fresh pineapple eats you back',
            fact: 'Pineapple is packed with bromelain, an enzyme that digests protein—it’s why your tongue tingles, why it tenderizes meat, and why fresh pineapple wrecks gelatin desserts. Canned pineapple is safe: heat kills the enzyme.',
            detail: 'Bromelain is so effective that it’s sold as meat tenderizer, alongside papain from papaya. Your tongue recovers quickly—the mouth’s cells regenerate fast, and saliva stands in as a sacrificial protein shield.'
        },
        {
            tag: 'PHYSICS',
            title: 'Apples float because they’re a quarter air',
            fact: 'About 25% of an apple’s volume is air pockets between cells—which is why apples bob for the bobbing, while denser fruit like pears mostly sink.',
            detail: 'The same air spaces give apples their crunch: bite down and the crisp sound is thousands of turgid cells fracturing at once. When those cells deflate with age, the air stays but the snap is gone—that’s a mealy apple.'
        },
        {
            tag: 'PHYSICS',
            title: 'Grapes make plasma in the microwave',
            fact: 'Two grapes touching in a microwave can spark a glowing blob of plasma. Physicists took it seriously and showed a grape is coincidentally the right size to trap and concentrate microwave energy at the point where the two grapes meet. Spectacular—and genuinely dangerous for your microwave.',
            detail: 'The 2019 study—“Linking plasma formation in grapes to microwave resonance of aqueous dimers”—showed each grape acts as a resonant cavity for the oven’s microwaves, focusing a hotspot at the contact point until the sparks ionize sodium and potassium from the skin.',
            source: 'Khattak et al., PNAS (2019)'
        },
        {
            tag: 'PHYSICS',
            title: 'Bananas are measurably radioactive',
            fact: 'Bananas are rich in potassium, and a sliver of natural potassium is the radioactive isotope potassium-40. The dose is so tiny that radiation safety folks jokingly use the “banana equivalent dose” to put scarier numbers in perspective.',
            detail: 'One banana works out to roughly 0.1 microsievert—a chest X-ray is on the order of a thousand bananas. Your body keeps its potassium level constant, so eating bananas doesn’t actually accumulate any extra dose.'
        },
        {
            tag: 'BOTANY',
            title: 'A banana plant is a giant herb, and every Cavendish is a clone',
            fact: 'Banana “trees” have no wood—the trunk is tightly rolled leaf bases, making the banana one of the largest herbs on Earth. And the supermarket Cavendish is seedless and sterile, so every one is propagated as a genetic copy of the same plant.',
            detail: 'That uniformity is a standing risk. The Cavendish only took over after the previous export king, Gros Michel, was ruined by Panama disease in the mid-1900s—and a newer strain of the same soil fungus (TR4) is now spreading through Cavendish plantations.'
        },
        {
            tag: 'LANGUAGE',
            title: 'The fruit named the color orange',
            fact: 'English had the fruit before it had the word for the color. “Orange” traveled from Sanskrit through Persian and Arabic with the fruit itself; before it arrived, English speakers made do with “yellow-red” (ġeolurēad).',
            detail: 'The word’s journey ran roughly nāraṅga (Sanskrit) → nārang (Persian) → nāranj (Arabic) → orenge (Old French) → orange. Its first recorded uses as an English color name date to the early 1500s.'
        },
        {
            tag: 'GENOMICS',
            title: 'Almost every citrus you know is a hybrid',
            fact: 'Genome studies show most familiar citrus descends from a few wild ancestors—mainly the mandarin, the pomelo, and the citron. The sweet orange is a mandarin–pomelo cross; the lemon traces back to citron crossed with sour orange. Citrus is one big family remix.',
            detail: 'The grapefruit is the newest member: an accidental 18th-century Barbados cross between a pomelo and a sweet orange. Limes, bergamot, and most of the rest of the citrus aisle are further shuffles of the same few ancestral decks.'
        },
        {
            tag: 'CHEMISTRY',
            title: 'One bad apple really does spoil the bunch',
            fact: 'Ripening fruit releases ethylene gas, and ethylene tells nearby fruit to ripen too—so one overripe apple genuinely pushes its neighbors over the edge. The same trick works for you: bag a hard avocado with a banana and it ripens faster.',
            detail: 'Ethylene’s discovery as a plant hormone traces to 19th-century street trees mysteriously dropping leaves near leaky gas lamps. Today, warehouses store apples in low-oxygen rooms and ship bananas green, gassing them with ethylene on arrival to ripen on schedule.'
        },
        {
            tag: 'BOTANY',
            title: 'Every corn kernel is a fruit',
            fact: 'Corn is a giant grass, and each kernel on the cob is botanically a complete fruit called a caryopsis—fruit wall and seed fused into one package. An ear of corn is hundreds of fruits arranged in rows.',
            detail: 'All grass “grains” work this way—wheat, rice, barley—so a grain of rice is a fruit too. Bonus: every strand of corn silk is the pollen-catching style of one flower. One silk, one kernel.'
        },
        {
            tag: 'BOTANY',
            title: 'Broccoli, kale, and cabbage are the same species',
            fact: 'Broccoli, cauliflower, kale, cabbage, Brussels sprouts, and kohlrabi are all Brassica oleracea—one wild Mediterranean plant sculpted by humans into wildly different vegetables by exaggerating flowers, leaves, buds, or stems.',
            detail: 'The mapping: kale and cabbage are leaves (loose vs. balled), Brussels sprouts are side buds, kohlrabi is a swollen stem, and broccoli and cauliflower are flower heads harvested before they bloom. Same genome, different organ turned up to eleven.'
        },
        {
            tag: 'BOTANY',
            title: 'Apples and peaches are roses',
            fact: 'Apples, pears, peaches, cherries, plums, apricots, strawberries, raspberries, and almonds all belong to the rose family, Rosaceae. Most of the fruit bowl is one botanical family reunion.',
            detail: 'The family resemblance is easiest to see in spring: apple, cherry, and plum blossoms share the wild rose’s simple five-petaled plan. The rose family feeds us more kinds of fruit than any other plant family.'
        },
        {
            tag: 'BOTANY',
            title: 'Almonds are peach pits’ cousins',
            fact: 'The almond is essentially a peach relative where we eat the seed and discard the flesh—both are in the genus Prunus. Wild bitter almonds are laced with amygdalin, which releases cyanide; domestication hinged on finding sweet mutants that were safe to eat.',
            detail: 'Amygdalin splits into hydrogen cyanide and benzaldehyde—the latter is the classic “almond” aroma. The kinship is practical, too: peach–almond hybrids are workhorse rootstocks in modern orchards.'
        },
        {
            tag: 'HISTORY · RÉUNION',
            title: 'A 12-year-old invented vanilla farming',
            fact: 'Vanilla is the fruit of an orchid, and outside Mexico its natural pollinator is missing. In 1841, Edmond Albius—a 12-year-old enslaved boy on Réunion—invented the quick hand-pollination technique still used on virtually every vanilla farm today.',
            detail: 'His method—lifting the flap that separates the flower’s male and female parts with a sliver of bamboo, then pressing them together—is still called “le geste d’Edmond.” It has to be performed flower by flower, because each vanilla bloom opens for a single day.'
        },
        {
            tag: 'BOTANY',
            title: 'Orchid seeds are dust that needs a fungus',
            fact: 'A single orchid seed pod can hold hundreds of thousands to millions of seeds, each nearly weightless and carrying no food reserves at all. To germinate, an orchid seed must be adopted by a soil fungus that feeds it.',
            detail: 'It’s a numbers game: make seeds light as dust and the wind carries them anywhere, but strip out the packed lunch and almost none survive. The rare seed that lands on the right fungus lets the fungus grow into it—then eats its host from the inside.',
            source: 'Royal Botanic Gardens, Kew',
            url: 'https://www.kew.org/read-and-watch/orchid-seeds-natures-tiny-treasures'
        },
        {
            tag: 'RECORDS',
            title: 'A 2,000-year-old seed grew into a tree',
            fact: 'A Judean date palm seed recovered from Masada—roughly two millennia old—was planted in 2005 and germinated. The tree was nicknamed Methuselah, and it’s alive and well.',
            detail: 'Methuselah turned out to be male. Researchers have since sprouted more ancient seeds, including females—one, named Hannah, flowered, was pollinated by Methuselah, and has produced actual dates: a two-thousand-year gap between generations.',
            source: 'Sallon et al., Science (2008)',
            url: 'https://doi.org/10.1126/science.1153600'
        },
        {
            tag: 'RECORDS',
            title: 'The smallest fruit would fit on a pinhead',
            fact: 'Watermeal (Wolffia) is the world’s smallest flowering plant—an entire plant is the size of a candy sprinkle, and a “bouquet” fits on a fingertip. It also produces the world’s smallest fruit.',
            detail: 'Wolffia skips roots and leaves entirely—it’s basically a floating green speck that buds off copies of itself every day or two, among the fastest multiplication in flowering plants. In parts of Southeast Asia it’s eaten as khai-nam, “water eggs.”'
        },
        {
            tag: 'RECORDS',
            title: 'Jackfruit is the heavyweight of tree fruit',
            fact: 'The jackfruit is the largest fruit that grows on a tree—big specimens weigh more than 30 kg. The trees can’t hold them on branches, so the fruit sprouts straight from the trunk.',
            detail: 'Fruiting straight from the trunk has a name—cauliflory—and it’s the only sane engineering choice at this scale. A single tree can set well over a hundred fruits a year, and the unripe flesh shreds like pulled pork, which made it a barbecue-menu star.'
        },
        {
            tag: 'RECORDS',
            title: 'Bamboo can grow almost a meter a day',
            fact: 'Some bamboo species grow around 90 cm in 24 hours—the fastest-growing plants on record. Sit next to one on a good day and it will visibly outgrow the afternoon.',
            detail: 'Bamboos are grasses, and some keep a stranger schedule: species that flower once every several decades, in sync across whole regions—then die back en masse. Botanists call it gregarious flowering, and some cycles run longer than a human lifetime.'
        },
        {
            tag: 'RECORDS',
            title: 'The oldest known tree predates the pyramids',
            fact: 'A Great Basin bristlecone pine in California is over 4,850 years old—it was already growing before the Great Pyramid of Giza was built, and it’s still adding rings.',
            detail: 'The record-holder, Methuselah, grows at a location kept secret to protect it. The cautionary tale is Prometheus: a Nevada bristlecone felled in 1964 that turned out to be roughly as old—its true age discovered only by counting the rings of the stump.'
        },
        {
            tag: 'RECORDS',
            title: 'A forest in Utah is one single tree',
            fact: 'Pando is a quaking aspen clone with tens of thousands of trunks sharing one root system—genetically a single tree spread over about 40 hectares, weighing on the order of 6,000 tonnes. It’s one of the heaviest organisms known.',
            detail: '“Pando” is Latin for “I spread.” Surveys suggest the giant is slowly shrinking: deer and cattle browse the young shoots faster than the clone replaces its aging trunks, so parts of it are fenced off to let new stems escape the grazers.',
            source: 'DeWoody et al. (2008)',
            url: 'https://www.fs.usda.gov/NFGEL/documents/publications/DeWoody_etal_pando_2008.pdf'
        },
        {
            tag: 'BEHAVIOR',
            title: 'Venus flytraps can count',
            fact: 'A flytrap doesn’t snap on the first touch. It waits for a second trigger-hair signal within about 20 seconds before closing, and only starts pumping digestive juices after roughly five—counting to avoid wasting energy on raindrops.',
            detail: 'The snap itself takes about a tenth of a second—among the fastest movements in the plant kingdom—powered by the leaf flipping from convex to concave like a popped contact lens. More touches after closing tell the plant how big its meal is, scaling the digestive effort.',
            source: 'Böhm et al., Current Biology (2016)',
            url: 'https://doi.org/10.1016/j.cub.2015.11.057'
        },
        {
            tag: 'BEHAVIOR',
            title: 'Grown-up sunflowers all face east',
            fact: 'Young sunflowers track the sun across the sky, swinging east to west and back overnight. Mature flowers stop and lock facing east—the morning sun warms them faster, and warm flowers attract measurably more pollinators.',
            detail: 'The tracking is growth in disguise: the stem’s east side elongates by day and the west side by night, rocking the head back and forth on a circadian rhythm. In experiments, east-facing heads warmed faster at dawn and drew several times more pollinator visits than heads turned west.',
            source: 'Atamian et al., Science (2016)',
            url: 'https://doi.org/10.1126/science.aaf9793'
        },
        {
            tag: 'CHEMISTRY',
            title: 'Coffee plants drug their pollinators',
            fact: 'Caffeine is a natural insecticide—but coffee and citrus flowers also lace their nectar with tiny doses of it. At those levels caffeine boosts a bee’s memory of the flower’s scent, making the bee more likely to come back. Loyalty, chemically induced.',
            detail: 'In the experiments, honeybees fed caffeinated nectar were far more likely to remember a floral scent a full day later. The dosing is shrewd: nectar caffeine stays below the concentration bees can taste as bitter—the customer never notices the additive.',
            source: 'Wright et al., Science (2013)',
            url: 'https://doi.org/10.1126/science.1228806'
        },
        {
            tag: 'CHEMISTRY',
            title: 'One berry can make lemons taste sweet',
            fact: 'The West African miracle fruit contains miraculin, a protein that latches onto your sweet receptors and flips them on in the presence of acid. For the next hour or so, lemon juice tastes like lemonade.',
            detail: 'The berry itself is barely sweet—miraculin does nothing until acid arrives, which reshapes the receptor complex and switches it on. “Flavor tripping” parties are built around it, and the effect fades on its own as saliva washes the protein away.'
        },
        {
            tag: 'BOTANY',
            title: 'Dragon fruit comes from a night-blooming cactus',
            fact: 'Dragon fruit grows on a sprawling climbing cactus whose huge flowers open for a single night and wilt by morning—pollinated in the dark by moths and bats.',
            detail: 'The flowers can span more than 25 cm—among the largest of any cactus. Where the native night shift of bats and hawkmoths is missing, growers walk the rows after dark and hand-pollinate by headlamp.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Ripe cranberries bounce',
            fact: 'Good cranberries have air chambers inside—so growers literally sort them by bouncing. Fruit that clears the barrier boards is firm and ripe; fruit that goes splat gets rejected. The air pockets are also why cranberries float in flooded bogs at harvest.',
            detail: 'Grower lore credits the discovery to John “Peg-Leg” Webb, who supposedly poured his crop down the stairs and noticed only the sound berries reached the bottom. Lore or not, bounce-board separators are real equipment in cranberry packing houses.'
        },
        {
            tag: 'AGRICULTURE · YORKSHIRE',
            title: 'Forced rhubarb grows fast enough to hear',
            fact: 'In Yorkshire’s “Rhubarb Triangle,” rhubarb is grown in pitch-dark heated sheds and harvested by candlelight. Starved of light, the stalks shoot up so quickly that the sheds fill with soft pops and creaks—the sound of rhubarb growing.',
            detail: 'The dark forces the plant to spend energy stored in its roots, yielding tender, vividly pink stalks; any stray light would toughen them. “Yorkshire Forced Rhubarb” holds EU protected-designation status—the same legal shield as Champagne.'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Lemons float. Limes sink.',
            fact: 'Drop them in water: lemons bob, limes go down. Limes are slightly denser than water and lemons slightly less—an easy bar bet you can win with a glass of water.',
            detail: 'The margin is tiny—both are mostly water—but the lemon’s thicker, spongier pith holds just enough air to tip it buoyant, while the lime’s denser flesh edges past water’s density.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'You can’t taste every apple in one lifetime of snacking',
            fact: 'Around 7,500 apple varieties are grown worldwide. Trying a new one every single day would take you more than 20 years.',
            detail: 'Apples don’t breed true from seed—plant a Honeycrisp pip and you get a genetic lottery ticket, usually a spitter. So every named variety is kept alive by grafting cuttings: each Fuji or Granny Smith is a clone, some lineages centuries old.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'One plant can grow tomatoes on top and potatoes below',
            fact: 'Tomatoes and potatoes are close nightshade relatives, so a tomato stem grafts cleanly onto a potato root. The result—sold as the “TomTato”—yields cherry tomatoes above the soil and potatoes beneath it, on a single plant.',
            detail: 'It’s a graft, not a hybrid—no gene mixing, just tomato plumbing joined onto potato plumbing. A UK nursery launched the TomTato commercially in 2013, but gardeners had been hand-crafting “pomatoes” long before.'
        },
        {
            tag: 'BOTANY',
            title: 'The corpse flower fakes a crime scene',
            fact: 'The titan arum blooms rarely—often years apart—and when it does, it heats itself up and pumps out the smell of rotting flesh to recruit carrion beetles and flesh flies as pollinators. Botanical gardens sell out tickets for the stench.',
            detail: 'The bloom warms to roughly human body temperature, which helps evaporate and pump out its perfume—a cocktail including dimethyl trisulfide, the same compound that scents rotting meat. The heat may also complete the corpse impression for arriving flies.'
        },
        {
            tag: 'LAW · USA',
            title: 'The US Supreme Court ruled the tomato is a vegetable',
            fact: 'Botanically a tomato is a fruit—a berry, even—but in Nix v. Hedden (1893) the Supreme Court unanimously declared it a vegetable, because that is how people eat it. The case was about import tariffs on vegetables.',
            quote: '“Botanically speaking, tomatoes are the fruit of a vine, just as are cucumbers, squashes, beans, and peas. But in the common language of the people … all these are vegetables … usually served at dinner in, with, or after the soup, fish, or meats … and not, like fruits generally, as dessert.” — Justice Horace Gray',
            detail: 'The Nix family imported tomatoes and sued the Port of New York to recover tariff duties, arguing tomatoes were duty-free fruit. Botany lost 9–0 to eating habits.',
            source: 'Nix v. Hedden, 149 U.S. 304 (1893)',
            url: 'https://supreme.justia.com/cases/federal/us/149/304/'
        },
        {
            tag: 'GENOMICS',
            title: 'A tomato has more genes than you do',
            fact: 'The tomato genome, sequenced in 2012, carries roughly 35,000 protein-coding genes. Humans get by with about 20,000.',
            detail: 'The variety sequenced was “Heinz 1706”—yes, the ketchup tomato—by a consortium of some 300 scientists across more than a dozen countries. Plants in general out-gene animals; genome duplications along the way left tomatoes with spare copies to tinker with.',
            source: 'The Tomato Genome Consortium, Nature (2012)',
            url: 'https://doi.org/10.1038/nature11119'
        },
        {
            tag: 'KITCHEN SCIENCE',
            title: 'Your fridge is murdering your tomatoes',
            fact: 'Chilling tomatoes below about 12 °C switches off the genes that make their flavor volatiles—and much of the flavor never comes back after rewarming. Keep them on the counter.',
            detail: 'In the study, a week of cold storage cut key flavor volatiles by well over half, and blind taste panels could tell: chilled tomatoes rated flatter even after days of rewarming. The chill even leaves marks on the DNA’s methylation—cold storage is written into the fruit.',
            source: 'Zhang et al., PNAS (2016)',
            url: 'https://doi.org/10.1073/pnas.1613910113'
        },
        {
            tag: 'ANATOMY',
            title: 'A tomato is basically water with ambitions',
            fact: 'A ripe tomato is roughly 95% water. Almost everything you taste—sugars, acids, and dozens of aroma compounds—lives in the remaining ~5%.',
            detail: 'That’s why sun-dried tomatoes hit so hard: strip the water and you concentrate the sugars, acids, and glutamate—the same savory amino acid that makes parmesan and soy sauce moreish. Tomatoes are one of the richest fresh sources of it.'
        },
        {
            tag: 'CULTURE · SPAIN',
            title: 'A Spanish town holds a yearly tomato war',
            fact: 'Every August, Buñol in Spain hosts La Tomatina: tens of thousands of people pelting each other with well over a hundred tonnes of overripe tomatoes. It started with a street brawl in 1945.',
            detail: 'House rule number one: squash the tomato before you throw it. The fight lasts exactly one hour, the tomatoes are low-grade fruit trucked in for the purpose, and since 2013 the crowd is capped by ticket—about 20,000 combatants.'
        },
        {
            tag: 'SPACE',
            title: 'NASA lost a space tomato for eight months',
            fact: 'One of the first tomatoes grown aboard the International Space Station went missing in 2023 after astronaut Frank Rubio harvested it. He was jokingly accused of eating it—until the shriveled tomato was found eight months later, clearing his name.',
            detail: 'The fruit was a Red Robin dwarf tomato from the Veg-05 experiment. Rubio had bigger problems: his ride home developed a coolant leak, stretching his mission to 371 days—the longest single spaceflight by a US astronaut.'
        },
        {
            tag: 'ORIGINS · ANDES',
            title: 'Wild tomatoes are the size of peas',
            fact: 'The tomato’s wild ancestors from the Andes, like the currant tomato Solanum pimpinellifolium, bear fruit about a centimeter across. Thousands of years of selection turned that into the beefsteak.',
            detail: 'Domestication traded flavor and toughness for size and shelf life—so breeders keep going back to the pea-sized wild relatives to reclaim lost disease-resistance and taste genes. The wild currant tomato still grows on Peruvian roadsides.'
        },
        {
            tag: 'HISTORY · EUROPE',
            title: 'Europeans once treated tomatoes as poison',
            fact: 'As a nightshade relative, the tomato spent a long stretch of European history as a suspicious ornamental—nicknamed the “poison apple”—before it finally won a place on the dinner table.',
            detail: 'A popular story blames pewter plates leaching lead into acidic tomato juice and sickening aristocrats—historians treat that one as legend. What’s documented is the plant’s ornamental career as the “love apple” and its guilt-by-association with deadly nightshade.'
        },
        {
            tag: 'RECORDS',
            title: 'The heaviest tomato weighed as much as a bowling ball',
            fact: 'The Guinness world record for heaviest tomato stands at about 5.28 kg (11 lb 14 oz), grown in Washington state in 2020. A regulation bowling ball can legally weigh less.',
            detail: 'Competitive giant-vegetable growers are a real scene: seeds from record fruit are traded and auctioned, and the 2020 champion dethroned a record that had stood since 1986. Giant tomatoes ride on megabloom flowers—several flowers fused into one.'
        },
        {
            tag: 'AGRICULTURE',
            title: 'Humanity grows a staggering pile of tomatoes',
            fact: 'The world produces on the order of 190 million tonnes of tomatoes a year—one of the most-grown fruits on Earth—with China alone accounting for roughly a third.',
            detail: 'A big share never reaches a salad: processing tomatoes—bred oblong and tough for machine harvest—become the world’s paste, sauce, and ketchup. The fresh and processing industries effectively grow two different fruits under one name.'
        },
        {
            tag: 'RESEARCH · SAP',
            title: 'Scientists tap tomato sap by cutting an aphid’s straw mid-sip',
            fact: 'To sample pure phloem sap, researchers let an aphid plug its needle-like mouthpart into a tomato stem, then sever the mouthpart. Sap keeps flowing out of the stump for hours. The verdict: tomato phloem is loaded with glutamine and glutamate.',
            detail: 'The technique is called stylectomy—the phloem’s internal pressure does the pumping once the stylet is cut. It matters because phloem sap is nearly impossible to collect uncontaminated any other way; the aphid’s precision beats any human needle.',
            note: 'This is why glutamine shows up as a nitrogen currency in my tomato digital twin.',
            source: 'Valle, Boggio & Heldt (1998)',
            url: 'https://doi.org/10.1093/oxfordjournals.pcp.a029391'
        },
        {
            tag: 'RESEARCH · ROOTS',
            title: 'Tomatoes throttle their own fertilizer intake',
            fact: 'When researchers plunged tomato plants into darkness, the roots dialed nitrate uptake down from about 52 to 12 µmol per gram per hour within hours—the plant sensed it had enough stockpiled and eased off.',
            detail: 'As uptake fell, the plant’s internal nitrate pool climbed from about 41 to 70 mM—strong evidence the stockpile itself is the brake. The authors fitted the feedback as a straight line; whether it should really be a curve is an open question.',
            note: 'My model treats this self-regulation as a feedback loop instead of a straight line.',
            source: 'Cárdenas-Navarro et al. (1998)',
            url: 'https://doi.org/10.1093/jxb/49.321.721'
        },
        {
            tag: 'RESEARCH · MODELING',
            title: 'There is a virtual tomato with 6,689 chemical reactions',
            fact: 'The VYTOP model stitches together leaf, stem, and root metabolism—6,689 reactions in all—and even gives the plant’s internal plumbing, xylem and phloem, their own compartments.',
            detail: 'VYTOP stands for Virtual Young TOmato Plant. Treating xylem and phloem as explicit compartments is what lets the model ask questions a single-organ model can’t—like which organ actually pays the energy bill for moving nitrogen around.',
            note: 'My digital twin’s leaf and transport logic descend from this scaffold.',
            source: 'Gerlin et al. (2022)',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            tag: 'RESEARCH · TRANSPORT',
            title: 'Tomatoes ship nitrogen almost entirely as glutamine',
            fact: 'Modeling backed by metabolomics suggests glutamine makes up roughly 80% of the organic cargo riding up a tomato’s xylem. One molecule dominates the whole freight line.',
            detail: 'Glutamine is a smart shipping container: two nitrogen atoms per molecule on a small carbon frame, so the plant moves more nitrogen per unit of carbon spent. The model’s prediction lined up with what the authors measured in real xylem sap.',
            source: 'Gerlin et al. (2022)',
            url: 'https://doi.org/10.1093/plphys/kiab548'
        },
        {
            tag: 'RESEARCH · HORTICULTURE',
            title: 'Want giant tomatoes? Pick some off',
            fact: 'Classic greenhouse experiments show that the fewer fruits a tomato plant carries, the bigger each remaining fruit grows—the plant reroutes its sugar budget to the survivors. Competition is real, even on a vine.',
            detail: 'Fruit load changed how the whole plant split its dry matter: heavily loaded plants sent most of it to fruit at the expense of leaves and roots. Growers exploit this daily—truss pruning is standard practice in greenhouse tomato production.',
            source: 'Heuvelink (1997)',
            url: 'https://doi.org/10.1016/S0304-4238(96)00993-4'
        },
        {
            tag: 'RESEARCH · ENERGY',
            title: 'One sucrose molecule is worth about 54 ATP',
            fact: 'Modern plant-respiration accounting puts the energy yield near 27 ATP per hexose—so a sucrose, with two hexose units, buys the plant roughly 54 ATP. Older textbook numbers ran almost a factor of two lower.',
            detail: 'The textbook “36–38 ATP per glucose” never survived contact with real bioenergetics—proton leaks, transport costs, and alternative pathways all shave the yield, and plant mitochondria have their own quirks. The 2023 accounting lands at about 27.1–27.5 ATP per hexose.',
            note: 'Finding this out forced me to re-price every energy budget in my model.',
            source: 'Amthor (2023)',
            url: 'https://doi.org/10.1093/aob/mcad075'
        },
        {
            tag: 'RESEARCH · CHEMISTRY',
            title: 'Turning fertilizer into protein costs eight electrons a pop',
            fact: 'Reducing a single nitrate ion to ammonium takes eight electrons: two to reach nitrite, six more to finish the job. Nitrogen is expensive, which is why plants ration it so carefully.',
            detail: 'The bill splits across two enzymes: nitrate reductase spends two electrons in the cytosol, then nitrite reductase spends six more in the plastid. Roots running this chemistry can burn a meaningful slice of the plant’s entire respiratory budget.',
            source: 'Scheurwater et al. (2002)',
            url: 'https://doi.org/10.1093/jxb/erf008'
        },
        {
            tag: 'RESEARCH · PLUMBING',
            title: 'Sugar rides a pressure wave through the plant',
            fact: 'Sugar doesn’t diffuse lazily through a tomato plant—loading it into the phloem builds pressure that drives bulk flow toward the fruit, like water through a squeezed hose. How the fruit unloads it at the far end is still being argued about.',
            detail: 'The pressure-flow idea dates to Ernst Münch in 1930 and has held up remarkably well for the long haul. The unresolved part is the last millimeter: fleshy fruits appear to unload sugar through the cell-wall space (the apoplast), and the rates there are still poorly pinned down.',
            source: 'Liesche & Patrick (2017)',
            url: 'https://doi.org/10.12688/f1000research.12577.1'
        },
        {
            tag: 'RESEARCH · DEVELOPMENT',
            title: 'A tomato fruit rewires its own metabolism as it grows',
            fact: 'Constraint-based modeling shows a developing tomato fruit doesn’t run one fixed metabolic program—its central fluxes get reprogrammed stage by stage from green marble to ripe fruit.',
            detail: 'The model tracked nine developmental stages of the same fruit and found the flux map shifting under the hood even while growth looked smooth from outside—storage, energy, and building-block priorities all trade places over time.',
            note: 'This model is the foundation of the fruit inside my digital twin.',
            source: 'Colombié et al. (2015)',
            url: 'https://doi.org/10.1111/tpj.12685'
        }
    ];

    // The random popup and the permanent Understory library share this exact
    // collection. New daily facts therefore appear in both places at once.
    window.UNDERSTORY_FACTS = facts;

    // Plain-language definitions for the jargon that sneaks into the facts.
    // Matching terms get a dotted underline; hover, tap, or focus shows the
    // definition in a small bubble. Keys must be lowercase; plurals are
    // matched automatically. The daily fact-hunter job adds entries here
    // whenever a new fact introduces a strange word.
    const GLOSSARY = {
        "fractal": "a shape whose parts repeat the whole pattern at smaller and smaller scales",
        "inflorescence": "a cluster of flowers arranged on one stem, acting as a unit",
        "floret": "one tiny complete flower inside a larger composite flower head",
        "gravitropism": "growth steered by gravity — roots grow with it, shoots against it",
        "chitin": "the tough material that builds fungal cell walls and insect shells",
        "aril": "a fleshy extra coat that grows around some seeds",
        "corm": "a swollen underground stem base a plant regrows from, like a bulb",
        "stigma": "the pollen-receiving tip of a flower’s female organ",
        'achene': 'a tiny dry one-seeded fruit that looks like a seed itself',
        'drupe': 'a fleshy fruit with a single stone around its seed, like a peach or cherry',
        'parthenocarpic': 'setting fruit without any pollination, so the fruit is seedless',
        'geocarpy': 'ripening fruit underground',
        'octoploid': 'carrying eight copies of every chromosome set (humans carry two)',
        'caryopsis': 'a grass fruit in which the seed and fruit wall are fused into one grain',
        'cauliflory': 'flowering and fruiting straight from the trunk instead of the branches',
        'trpv1': 'the nerve receptor that senses burning heat — and chili spice',
        'megafauna': 'the giant animals of the last ice age, like mammoths and ground sloths',
        'phloem': 'the plant’s sugar pipeline, carrying sap from leaves to fruit and roots',
        'xylem': 'the plant’s water pipeline, carrying water and minerals up from the roots',
        'stylectomy': 'severing a feeding aphid’s mouthpart to tap the sap flowing through it',
        'amygdalin': 'a plant defense compound that releases cyanide when broken down',
        'bromelain': 'a pineapple enzyme that digests protein',
        'miraculin': 'the miracle-fruit protein that makes sour foods taste sweet',
        'capsaicin': 'the molecule that makes chilies feel hot',
        'ethylene': 'a gas that fruit release as a ripening hormone',
        'mutualism': 'a partnership between species where both sides benefit',
        'receptacle': 'the base of a flower, which can swell into what we eat as “fruit”',
        'accessory fruit': 'fruit flesh built from flower parts other than the seed-holding ovary',
        'gregarious flowering': 'an entire species flowering in sync, then dying back together',
        'circadian': 'run by a built-in clock that cycles roughly every 24 hours',
        'apoplast': 'the network of cell walls and spaces outside the cells themselves',
        'turgid': 'swollen firm with internal water pressure',
        'hexose': 'a six-carbon sugar unit, like glucose or fructose',
        'atp': 'the small molecule cells use as their energy currency',
        'constraint-based': 'a modeling approach that maps which reaction rates are even feasible, given the network’s limits',
        'metabolomics': 'measuring all the small molecules in a sample at once',
        'volatile': 'a small airborne molecule — the kind your nose picks up as aroma',
        'flux': 'the rate at which material flows through a reaction or pathway',
        'plastid': 'a plant cell compartment; chloroplasts are the famous kind',
        'cytosol': 'the fluid filling the inside of a cell',
        'rootstock': 'the root-and-stem base that a fruit variety is grafted onto',
        'pith': 'the spongy white layer under a citrus peel',
        'truss': 'one stalk-full of tomato flowers or fruit, borne as a cluster',
        'dry matter': 'what remains of plant material once all the water is removed'
    };

    const termPattern = new RegExp(
        '\\b(' + Object.keys(GLOSSARY)
            .sort((a, b) => b.length - a.length)
            .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|') + ')(e?s)?\\b',
        'gi'
    );

    const LAST_INDEX_KEY = 'tomatoFunFactLastIndex';
    const LAST_AUTO_KEY = 'tomatoFactLastAuto';
    // Paused while Monet Light & Strokes is the primary visitor journey.
    // Keep the manual tomato-button experience available for curious visitors.
    const AUTO_OPEN_ENABLED = false;
    const NEWEST_SEEN_KEY = 'tomatoFunFactNewestSeen';
    const SEEN_COUNTS_KEY = 'tomatoFunFactSeenCounts';
    const SEEN_COUNT_CAP = 9;

    function loadSeenCounts() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SEEN_COUNTS_KEY));
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) { /* corrupt storage reads as "nothing seen yet" */ }
        return {};
    }

    function recordSeen(fact) {
        const counts = loadSeenCounts();
        counts[fact.title] = Math.min(SEEN_COUNT_CAP, (counts[fact.title] || 0) + 1);
        // Drop titles that no longer exist so the record can't grow forever.
        const titles = new Set(facts.map((f) => f.title));
        for (const title of Object.keys(counts)) {
            if (!titles.has(title)) delete counts[title];
        }
        try {
            localStorage.setItem(SEEN_COUNTS_KEY, JSON.stringify(counts));
        } catch (_) { /* private mode etc. — weighting just stays off */ }
    }

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    let currentIndex = -1;
    let lastFocusedElement = null;
    let shuffledOrder = [];
    let shufflePosition = 0;

    // Weighted shuffle (Efraimidis–Spirakis): facts the visitor has already
    // seen get weight 1/(1 + 2·views), so unseen facts tend to surface first
    // while every fact still appears once before any repeats.
    function reshuffle() {
        const counts = loadSeenCounts();
        shuffledOrder = facts
            .map((fact, i) => {
                const weight = 1 / (1 + 2 * (counts[fact.title] || 0));
                return { i, key: Math.pow(Math.random(), 1 / weight) };
            })
            .sort((a, b) => b.key - a.key)
            .map((entry) => entry.i);
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

    // Writes `text` into `element`, wrapping glossary terms in tappable
    // buttons that carry their definition bubble.
    function renderAnnotated(element, text) {
        element.textContent = '';
        let last = 0;
        text.replace(termPattern, (match, base, _suffix, offset) => {
            const definition = GLOSSARY[base.toLowerCase()];
            if (!definition) return match;
            element.appendChild(document.createTextNode(text.slice(last, offset)));
            const term = document.createElement('button');
            term.type = 'button';
            term.className = 'tomato-fact-term';
            term.setAttribute('aria-expanded', 'false');
            term.appendChild(document.createTextNode(match));
            const bubble = document.createElement('span');
            bubble.className = 'tomato-fact-term-def';
            bubble.setAttribute('role', 'tooltip');
            bubble.textContent = definition;
            term.appendChild(bubble);
            element.appendChild(term);
            last = offset + match.length;
            return match;
        });
        element.appendChild(document.createTextNode(text.slice(last)));
    }

    // Keeps a definition bubble inside the dialog instead of clipping at
    // its right edge.
    function clampBubble(term, dialog) {
        const bubble = term.querySelector('.tomato-fact-term-def');
        if (!bubble) return;
        bubble.style.left = '0px';
        const bubbleRect = bubble.getBoundingClientRect();
        if (!bubbleRect.width) return;
        const overflow = bubbleRect.right - (dialog.getBoundingClientRect().right - 14);
        if (overflow > 0) bubble.style.left = `${-overflow}px`;
    }

    function closeOpenTerms(dialog, except) {
        dialog.querySelectorAll('.tomato-fact-term.open').forEach((term) => {
            if (term !== except) {
                term.classList.remove('open');
                term.setAttribute('aria-expanded', 'false');
            }
        });
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
                <div class="tomato-fact-details" id="tomatoFactDetails" hidden>
                    <blockquote class="tomato-fact-quote" hidden></blockquote>
                    <p class="tomato-fact-detail" hidden></p>
                    <p class="tomato-fact-project" hidden><strong>Why I care:</strong> <span></span></p>
                    <a class="tomato-fact-paper" target="_blank" rel="noopener noreferrer" hidden></a>
                </div>
                <div class="tomato-fact-ask" id="tomatoFactAsk" hidden>
                    <p class="tomato-fact-ask-hint">Sends this fact to an AI and asks how it works and how solid
                        the evidence is, in bullet points. DeepSeek has no prefill link, so its button copies the
                        prompt and opens the app — just paste. AI answers can be confidently wrong; double-check
                        anything that matters.</p>
                    <div class="tomato-fact-thread" aria-live="polite" hidden></div>
                    <div class="tomato-fact-ask-buttons">
                        <button class="tomato-fact-button primary" type="button" data-ai="deepseek">ask DeepSeek here</button>
                        <button class="tomato-fact-button" type="button" data-ai="deepseek-app">DeepSeek ↗</button>
                        <button class="tomato-fact-button" type="button" data-ai="claude">Claude ↗</button>
                        <button class="tomato-fact-button" type="button" data-ai="chatgpt">ChatGPT ↗</button>
                        <button class="tomato-fact-button" type="button" data-ai="gemini">Gemini ↗</button>
                        <button class="tomato-fact-button" type="button" data-ai="copy">copy prompt</button>
                    </div>
                </div>
                <div class="tomato-fact-actions">
                    <button class="tomato-fact-button" type="button" data-action="ask"
                            aria-expanded="false" aria-controls="tomatoFactAsk">check with AI</button>
                    <button class="tomato-fact-button" type="button" data-action="details"
                            aria-expanded="false" aria-controls="tomatoFactDetails">details</button>
                    <button class="tomato-fact-button" type="button" data-action="another">show another</button>
                    <a class="tomato-fact-button tomato-fact-library" href="/understory/">browse the understory</a>
                    <button class="tomato-fact-button primary" type="button" data-action="close">got it</button>
                </div>
            </section>`;
        document.body.appendChild(backdrop);

        backdrop.querySelector('.tomato-fact-close').addEventListener('click', closeDialog);
        backdrop.querySelector('[data-action="close"]').addEventListener('click', closeDialog);
        backdrop.querySelector('[data-action="another"]').addEventListener('click', () => {
            showRandomFact(backdrop, true);
        });
        backdrop.querySelector('[data-action="details"]').addEventListener('click', () => {
            setDetailsOpen(backdrop, backdrop.querySelector('.tomato-fact-details').hidden);
        });
        backdrop.querySelector('[data-action="ask"]').addEventListener('click', () => {
            setAskOpen(backdrop, backdrop.querySelector('.tomato-fact-ask').hidden);
        });
        backdrop.querySelector('[data-ai="deepseek"]').hidden = !deepseekEnabled;
        backdrop.querySelectorAll('.tomato-fact-ask-buttons [data-ai]').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.dataset.ai === 'deepseek') {
                    askDeepSeek(backdrop);
                    return;
                }
                const prompt = buildAskPrompt(facts[currentIndex], '');
                if (button.dataset.ai === 'copy') {
                    copyText(prompt).then(
                        () => flashButtonLabel(button, 'copied!', 'copy prompt'),
                        () => flashButtonLabel(button, 'copy failed', 'copy prompt')
                    );
                    return;
                }
                if (button.dataset.ai === 'deepseek-app') {
                    copyText(prompt);
                    window.open('https://chat.deepseek.com/', '_blank', 'noopener');
                    flashButtonLabel(button, 'copied — paste it there', 'DeepSeek ↗');
                    return;
                }
                window.open(AI_LINKS[button.dataset.ai] + encodeURIComponent(prompt), '_blank', 'noopener');
            });
        });
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeDialog();
        });

        // Glossary terms: tap toggles the definition bubble (hover and
        // keyboard focus are handled purely in CSS).
        const dialog = backdrop.querySelector('.tomato-fact-dialog');
        dialog.addEventListener('click', (event) => {
            const term = event.target.closest('.tomato-fact-term');
            closeOpenTerms(dialog, term);
            if (!term) return;
            const open = term.classList.toggle('open');
            term.setAttribute('aria-expanded', String(open));
            if (open) clampBubble(term, dialog);
        });
        dialog.addEventListener('mouseover', (event) => {
            const term = event.target.closest('.tomato-fact-term');
            if (term) clampBubble(term, dialog);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !backdrop.hidden) closeDialog();
        });
        return backdrop;
    }

    // Chat services that accept a prefilled first message via URL.
    // (DeepSeek's web chat has no prefill parameter — it gets the in-page
    // thread below instead, plus the "copy prompt" fallback.)
    // Gemini's chat app has no prefill link either, so its button goes
    // through Google's Gemini-powered AI Mode, which does.
    const AI_LINKS = {
        claude: 'https://claude.ai/new?q=',
        chatgpt: 'https://chatgpt.com/?q=',
        gemini: 'https://www.google.com/search?udm=50&q='
    };

    // In-page DeepSeek answers, configured in deepseek-config.js — either
    // a proxy endpoint (recommended; key stays server-side) or a direct
    // apiKey (public!). Unconfigured → the button hides itself.
    const DEEPSEEK = window.DEEPSEEK_CONFIG || {};
    const deepseekEnabled =
        Boolean(String(DEEPSEEK.endpoint || '').trim() || String(DEEPSEEK.apiKey || '').trim());
    let deepseekThread = [];
    let deepseekPending = false;

    function appendThreadMessage(threadEl, kind, text) {
        const message = document.createElement('div');
        message.className = `tomato-fact-msg ${kind}`;
        message.textContent = text;
        threadEl.appendChild(message);
        message.scrollIntoView({ block: 'nearest' });
        return message;
    }

    async function askDeepSeek(backdrop) {
        if (deepseekPending) return;
        const threadEl = backdrop.querySelector('.tomato-fact-thread');
        const button = backdrop.querySelector('[data-ai="deepseek"]');
        // First tap asks the standard mechanism-and-evidence question;
        // further taps dig deeper on the same thread.
        const question = deepseekThread.length === 0
            ? 'Tell me more — what is the mechanism behind this, and how solid is the evidence?'
            : 'Go deeper — explain further, or add another interesting angle on this.';

        threadEl.hidden = false;
        appendThreadMessage(threadEl, 'user', question);
        if (deepseekThread.length === 0) {
            deepseekThread.push({
                role: 'system',
                content: 'You answer follow-up questions about a fun fact shown on a personal science website. Be accurate and concise (under 200 words), name reliable sources where you can, and say clearly when you are unsure. Format every answer as short bullet points, each line starting with "• ". Plain text — no other markdown.'
            });
            deepseekThread.push({ role: 'user', content: buildAskPrompt(facts[currentIndex], question) });
        } else {
            deepseekThread.push({ role: 'user', content: question });
        }
        const pendingEl = appendThreadMessage(threadEl, 'ai pending', 'thinking…');
        deepseekPending = true;
        button.disabled = true;

        try {
            const endpoint = String(DEEPSEEK.endpoint || '').trim()
                || 'https://api.deepseek.com/chat/completions';
            const headers = { 'Content-Type': 'application/json' };
            const directKey = String(DEEPSEEK.apiKey || '').trim();
            if (directKey) headers.Authorization = `Bearer ${directKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: DEEPSEEK.model || 'deepseek-chat',
                    messages: deepseekThread,
                    max_tokens: 600,
                    temperature: 0.3
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const answer = data && data.choices && data.choices[0]
                && data.choices[0].message && data.choices[0].message.content;
            if (!answer) throw new Error('empty response');
            deepseekThread.push({ role: 'assistant', content: answer.trim() });
            pendingEl.className = 'tomato-fact-msg ai';
            pendingEl.textContent = answer.trim();
            button.textContent = 'go deeper';
        } catch (error) {
            deepseekThread.pop(); // let the user retry the same question
            pendingEl.className = 'tomato-fact-msg error';
            pendingEl.textContent = `DeepSeek request failed (${error.message}). Try again, or use the link buttons.`;
        } finally {
            deepseekPending = false;
            button.disabled = false;
        }
    }

    function buildAskPrompt(fact, question) {
        const parts = [
            `I'm reading a fun fact on ${location.hostname || 'a website'}:`,
            `"${fact.title}" — ${fact.fact}`
        ];
        if (fact.detail) parts.push(`More context: ${fact.detail}`);
        if (fact.source) parts.push(`Source: ${fact.source}`);
        parts.push(`My question: ${question || 'Tell me more — what is the mechanism behind this, and how solid is the evidence?'}`);
        parts.push('Please answer accurately, cite reliable sources where you can, and say clearly when you are unsure. Format the answer as short, easy-to-scan bullet points.');
        return parts.join('\n\n');
    }

    // Synchronous-first copy, so a tab we open right afterwards can't
    // steal focus before the clipboard write lands.
    function copyText(text) {
        try {
            const scratch = document.createElement('textarea');
            scratch.value = text;
            scratch.setAttribute('readonly', '');
            scratch.style.position = 'fixed';
            scratch.style.opacity = '0';
            document.body.appendChild(scratch);
            scratch.select();
            const ok = document.execCommand('copy');
            scratch.remove();
            if (ok) return Promise.resolve();
        } catch (error) { /* fall through to the async API */ }
        return navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(text)
            : Promise.reject(new Error('clipboard unavailable'));
    }

    function flashButtonLabel(button, label, restore) {
        button.textContent = label;
        window.setTimeout(() => { button.textContent = restore; }, 1800);
    }

    function setAskOpen(backdrop, open) {
        backdrop.querySelector('.tomato-fact-ask').hidden = !open;
        const button = backdrop.querySelector('[data-action="ask"]');
        button.textContent = open ? 'never mind' : 'check with AI';
        button.setAttribute('aria-expanded', String(open));
    }

    function setDetailsOpen(backdrop, open) {
        backdrop.querySelector('.tomato-fact-details').hidden = !open;
        const button = backdrop.querySelector('[data-action="details"]');
        button.textContent = open ? 'hide details' : 'details';
        button.setAttribute('aria-expanded', String(open));
    }

    function showRandomFact(backdrop, bonus = false) {
        const avoid = currentIndex >= 0
            ? currentIndex
            : Number(localStorage.getItem(LAST_INDEX_KEY));
        renderFact(backdrop, nextRandomIndex(avoid), bonus ? 'another fun fact' : 'fun fact');
    }

    function renderFact(backdrop, index, kicker) {
        currentIndex = index;
        localStorage.setItem(LAST_INDEX_KEY, String(index));

        const fact = facts[index];
        recordSeen(fact);
        backdrop.querySelector('.tomato-fact-kicker').textContent = kicker;

        const tagEl = backdrop.querySelector('.tomato-fact-evidence');
        tagEl.hidden = !fact.tag;
        tagEl.textContent = fact.tag || '';

        backdrop.querySelector('.tomato-fact-title').textContent = fact.title;
        renderAnnotated(backdrop.querySelector('.tomato-fact-text'), fact.fact);

        const quoteEl = backdrop.querySelector('.tomato-fact-quote');
        quoteEl.hidden = !fact.quote;
        quoteEl.textContent = fact.quote || '';

        const detailEl = backdrop.querySelector('.tomato-fact-detail');
        detailEl.hidden = !fact.detail;
        renderAnnotated(detailEl, fact.detail || '');

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

        // Each fact starts collapsed; the button vanishes when there is
        // nothing extra to show.
        setDetailsOpen(backdrop, false);
        backdrop.querySelector('[data-action="details"]').hidden =
            !(fact.quote || fact.detail || fact.note || fact.source);
        setAskOpen(backdrop, false);
        deepseekThread = [];
        const threadEl = backdrop.querySelector('.tomato-fact-thread');
        threadEl.hidden = true;
        threadEl.textContent = '';
        backdrop.querySelector('[data-ai="deepseek"]').textContent = 'ask DeepSeek here';
    }

    function openDialog({ automatic = false } = {}) {
        const backdrop = document.getElementById('tomatoFactBackdrop') || buildDialog();
        if (automatic) localStorage.setItem(LAST_AUTO_KEY, localDateKey());
        // The freshest fact (facts[0]) gets first billing, once per visitor;
        // after that the rotation is random as usual.
        if (facts.length && localStorage.getItem(NEWEST_SEEN_KEY) !== facts[0].title) {
            localStorage.setItem(NEWEST_SEEN_KEY, facts[0].title);
            renderFact(backdrop, 0, 'the newest fun fact');
        } else {
            showRandomFact(backdrop);
        }
        lastFocusedElement = document.activeElement;
        backdrop.hidden = false;
        document.body.style.overflow = 'hidden';
        backdrop.querySelector('.tomato-fact-close').focus();
    }

    function closeDialog() {
        const backdrop = document.getElementById('tomatoFactBackdrop');
        if (!backdrop) return;
        backdrop.hidden = true;
        document.body.style.overflow = '';
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const tomatoButton = document.getElementById('tomatoToggle');
        if (tomatoButton) {
            buildDialog();
            tomatoButton.addEventListener('click', (event) => {
                if (!event.shiftKey) openDialog();
            });
        }

        // Automatic daily greeting is intentionally paused. The tomato button
        // above continues to open a fact on demand.
        if (AUTO_OPEN_ENABLED && localStorage.getItem(LAST_AUTO_KEY) !== localDateKey()) {
            window.setTimeout(() => openDialog({ automatic: true }), 1200);
        }
    });
})();
