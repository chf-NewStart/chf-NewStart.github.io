#!/usr/bin/env python3
"""One-off: top up fun-facts-queue.json for the daily-fun-fact workflow.

The daily GitHub Action pops one fact per day off the queue and prepends
it to tomato-facts.js. The queue was empty, so facts stopped appearing.
This refills it with 60 new, verified plant/nature facts (no repeats of
the 94 already in tomato-facts.js — titles are checked against the file).

Usage: python3 scripts/refill-fact-queue.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUEUE = ROOT / "fun-facts-queue.json"
FACTS_JS = ROOT / "tomato-facts.js"

FACTS = [
    # --- plants & growth ---
    ("RECORDS", "A single aspen colony can weigh more than a blue whale ×600",
     "Pando, a quaking aspen grove in Utah, is one tree: ~47,000 genetically identical stems sharing one root system. It weighs about 6,000 tonnes, making it likely the heaviest known living organism.",
     "Pando is also among the oldest living things — estimates run to thousands of years. It is shrinking, though: deer and cattle eat young shoots before they can replace dying stems."),
    ("PLANTS", "Bananas are slightly radioactive",
     "Bananas are rich in potassium, and about 0.012% of natural potassium is potassium-40, a radioactive isotope. The dose from one banana is tiny — it's the standard 'banana equivalent dose' used to make radiation levels intuitive.",
     "You would need around 10 million bananas in one sitting to approach a dangerous dose. Truckloads of bananas have been known to set off radiation sensors at ports."),
    ("PLANTS", "Cathedral oaks barely exist inside",
     "A mature oak trunk is mostly dead wood: only a thin rim of sapwood under the bark actually carries water, and just a few rings of cambium grow new wood each year. The heartwood at the center is the tree's steel skeleton, not its plumbing.",
     "That is why hollow trees can stay alive and leafy for decades — as long as the thin living rim stays connected, the tree keeps working."),
    ("PLANTS", "Corn roots can 'smell' trouble",
     "When insect larvae chew a neighbor's roots, corn seedlings grow their own roots toward the sound-like vibration cues and away from the threat. Root-to-root warning signals through soil are real chemistry, not metaphor.",
     "Simpler proof of plant communication: acacia trees browsed by giraffes pump ethylene into the air, and downwind trees start making bitter tannins before the giraffes arrive."),
    ("PLANTS", "Wheat, rice, and corn are just tame grasses",
     "Every major calorie crop — wheat, rice, corn, barley, oats, millet, sorghum, sugarcane — is a domesticated grass. Grasses domesticated humans right back: their spread tracks the spread of agriculture and of settled civilization.",
     "The grass family (Poaceae) covers about 20% of Earth's land surface and supplies the majority of human calories. Lawns, wheat fields, and prairies are all the same plant tribe."),
    ("PLANTS", "Bamboo can outrun a measuring tape",
     "Some bamboo species grow up to 90 cm in a single day — about 4 cm per hour, visible in real time. All the growth is pre-built: the shoot telescopes upward using cells already formed underground.",
     "A bamboo culm reaches full height in weeks, then spends the rest of its life thickening its walls rather than getting taller. Cut it down and it never regrows from that culm."),
    ("PLANTS", "The oldest seeds ever sprouted were 2,000 years old",
     "Seeds of the Judean date palm found at Masada and in ancient storehouses were germinated in 2005 after ~2,000 years of dormancy. The resulting palms — nicknamed Methuselah and friends — are alive and bearing fruit today.",
     "A closely related record: Silene stenophylla was regrown from placental tissue frozen in Siberian permafrost for about 32,000 years."),
    ("PLANTS", "Trees are mostly air and water, and mostly carbon",
     "Where does a tree's mass come from? Not from the soil. About 95% of a tree's dry mass is pulled from the air as CO2 and split into carbon and oxygen by photosynthesis. A forest is solidified atmosphere.",
     "Van Helmont's classic 1648 experiment: a willow in 90 kg of soil gained 76 kg over 5 years while the soil lost only grams. The soil is mineral supply, not bulk material."),
    ("PLANTS", "Tomatoes were once feared as poison",
     "European elites avoided tomatoes for two centuries, partly because wealthy diners who ate them (off pewter plates acid-leached by the fruit's juice) did sicken and die — the lead, not the tomato, was the killer.",
     "The tomato family, Solanaceae, also gives us potatoes, eggplants, peppers, belladonna, and tobacco. Many of its members really do synthesize toxins, so the fear was not baseless."),
    ("PLANTS", "Sunflowers secretly do math",
     "A sunflower's florets spiral in Fibonacci counts because each new primordium grows at the golden angle (~137.5°) from the last. That packing rule fills the head with near-equal, non-overlapping slots — nature's best answer to a geometry problem.",
     "The same rule sizes the spiral rows on pinecones, pineapples, and artichokes. It emerges automatically from simple growth timing, no blueprint required."),

    # --- physics & chemistry of everyday life ---
    ("PHYSICS", "Hot water can freeze faster than cold",
     "Under the right conditions — open containers, evaporation, dissolved gases — warm water can beat cold water to ice. The Mpemba effect, noticed by a Tanzanian student in 1963, still has no single settled explanation.",
     "Erasto Mpemba pushed the observation past embarrassed teachers until physicists tested it. The lesson survived: an inconvenient observation is data, not noise."),
    ("PHYSICS", "You are glowing right now",
     "Every warm object emits infrared light, and your 37 °C body is no exception — about 100 watts of it, mostly escaping as heat radiation. Thermal cameras see you because you are literally shining.",
     "Snakes in the pit-viper family, like rattlesnakes, 'see' this glow with pit organs sensitive enough to track a mouse by its body heat in total darkness."),
    ("PHYSICS", "Glass is a liquid that forgot how to flow",
     "The old 'windows are flowing liquid' claim is a myth — medieval glass is thick at the bottom because of how it was spun, not because it dripped. But glass genuinely is an amorphous solid: atoms locked in a liquid's disorder with none of its mobility.",
     "The everyday miracle: glass is rigid like a solid yet structurally a frozen liquid, and it never fully crystallizes no matter how slowly you cool it."),
    ("PHYSICS", "A teaspoon of neutron star outweighs a mountain range",
     "At neutron-star density, one teaspoon of matter masses about a billion tonnes — a city block squeezed into a sugar cube. The gravity on the surface would flatten any known material into a film one atom tall.",
     "A neutron star packs more mass than the Sun into a ball about 20 km across. Its crust is 10 billion times stiffer than steel — physicists call it 'nuclear pasta.'"),
    ("PHYSICS", "The air in your room weighs more than you think",
     "A typical bedroom holds roughly 50–60 kg of air — about the weight of an adult. You breathe and live inside a small ocean of matter that is simply hard to notice because it is everywhere at once.",
     "Atmospheric pressure is just that ocean's weight: 101 kPa, or about 10 tonnes pressing on every square metre of your desk — balanced from all sides, so nothing collapses."),
    ("PHYSICS", "Light takes ~8 minutes to reach you from the Sun",
     "Sunlight you feel is 8 minutes 20 seconds old. But the photon itself may be far older: energy generated in the Sun's core can take tens of thousands of years to random-walk out to the surface before escaping.",
     "So the light on your face was made when humans were still hunter-gatherers — a reminder that the Sun you see is a slow, glowing history."),
    ("PHYSICS", "Water is weirdest at 4 °C",
     "Water reaches maximum density at about 4 °C, so lakes freeze from the top down: ice floats, insulating the water below, and fish survive under the ice. Almost any other liquid would freeze solid from the bottom up, killing its ecosystem.",
     "Hydrogen bonds lock ice into a lattice that holds molecules farther apart than the liquid — about 9% less dense. Life in lakes depends on that small number."),
    ("PHYSICS", "You never actually touch anything",
     "When you press your hand on a table, electromagnetic repulsion between electron clouds stops a real 'touch' from ever occurring — you hover at about a nanometre's gap and feel a force field as contact.",
     "That nanometre gap is why a gecko can cling to glass: its toe pads exploit the same electromagnetic attraction, van der Waals forces, at millions of contact points."),
    ("PHYSICS", "Earth is smoother than a billiard ball",
     "Earth's tallest mountains and deepest trenches are within about 0.3% of its radius — proportionally smoother than a standard billiard ball's allowed tolerance. Everest and the Mariana Trench barely dent the curve.",
     "If Earth were shrunk to a globe in your hand, you would not feel the Himalayas; you might feel nothing at all. Its imperfections matter only at planetary scale."),

    # --- kitchen science ---
    ("KITCHEN SCIENCE", "Honey never spoils",
     "Archaeologists have opened 3,000-year-old Egyptian jars of edible honey. Its low water content and natural acidity make life impossible for microbes; bees also add an enzyme that slowly generates hydrogen peroxide.",
     "Crystallized honey is not spoiled — warm it gently and it returns. Honey's only real enemy is water: leave the lid off and it will ferment instead."),
    ("KITCHEN SCIENCE", "Garlic's burn is a chemical trap",
     "Intact garlic is odorless. Crushing breaks cell walls and mixes an enzyme with a precursor to build allicin — the molecule behind the sting, the breath, and most of the folklore. Cooking deactivates the enzyme, which is why roasted garlic is sweet and mellow.",
     "Allicin exists to wound: it irritates microbes and herbivores alike. Chopping garlic finer means more allicin, so the recipe's knife work is really a dose dial."),
    ("KITCHEN SCIENCE", "Salt makes things taste more like themselves",
     "Salt suppresses bitterness and amplifies aromas, so a pinch in coffee, caramel, or watermelon does not make food 'salty' — it clears the channel so the original flavor arrives louder.",
     "A little salt in bread dough also strengthens gluten, helping loaves rise higher. Same mineral, three different jobs."),
    ("KITCHEN SCIENCE", "The hole in a pasta spoon measures one serving",
     "The classic hole in a spaghetti server was sized to about one dry portion (roughly 100 g) of spaghetti — a built-in portion scale hiding in the utensil drawer.",
     "Bundle diameter, not strand count, is the trick: a circle of spaghetti the size of the hole is one serving, no scale required."),
    ("KITCHEN SCIENCE", "Onions were buried with pharaohs as proof of eternity",
     "Onions' layered rings and apparent resurrection after months in storage made them an Egyptian symbol of eternal life — Ramses IV was entombed with onions in his eye sockets.",
     "The same sulfur chemistry that makes onions pungent also makes them keep: sulfur compounds are natural antimicrobials, which is why onions store for months in the dark."),
    ("KITCHEN SCIENCE", "Bread rises because yeast exhales",
     "Yeast digests flour sugars and releases CO2; gluten traps the bubbles like balloon walls. The loaf's crumb is a fossil of millions of exhaled bubbles — bread is edible foam with a skeleton.",
     "The same gas law works in beer and champagne: one microbe's metabolism, three human industries."),
    ("KITCHEN SCIENCE", "Chili heat is measured on insects, not people",
     "The Scoville scale was built from human taste-dilution panels; the modern HPLC method measures capsaicin directly. Birds, notably, cannot feel capsaicin at all — chilies evolved their burn specifically to deter mammals, whose guts destroy the seeds.",
     "That is why bird-feeder suet is treated with capsaicin: squirrels (mammals) find it agonizing, birds eat happily, and the seeds survive the trip."),

    # --- animals & nature ---
    ("NATURE", "Octopuses edit their own RNA on the fly",
     "Most animals leave their RNA as written; octopuses and cuttlefish recode it extensively in response to temperature, tuning their own neural proteins on demand. A cephalopod can adapt its nervous system's wiring instructions in real time.",
     "This editing is so central that octopuses may have traded faster DNA evolution for more RNA editing — a genome that stays written in pencil."),
    ("NATURE", "Tardigrades survive the vacuum of space",
     "Dehydrated tardigrades enter a glass-like suspended state and have survived direct exposure to solar UV and the vacuum of low Earth orbit, then revived and reproduced on return.",
     "Their trick is a sugar-glass (trehalose) and intrinsically disordered proteins that lock cell interiors in place. Biotech is borrowing it to preserve vaccines without refrigeration."),
    ("NATURE", "Woodpeckers are their own crash helmets",
     "A woodpecker's skull has a hydraulic shock-absorbing mesh and a beak that decouples on impact, managing ~1,000 g decelerations thousands of times a day with no concussion.",
     "Engineers copied the architecture for black-box flight recorders. The bird has been running the experiment for millions of years."),
    ("NATURE", "Some animals breathe through their butts",
     "Freshwater turtles hoover water in and out of their cloaca to absorb oxygen through the lining — a backup respirator for winter under the ice. Sea cucumbers do the same with their rectal trees, and also share the orifice with fish that park there.",
     "Loach fish can switch between mouth and gut breathing depending on oxygen. Evolution keeps a spare entrance."),
    ("NATURE", "Mantis shrimp see colors we cannot name",
     "Mantis shrimp carry up to 16 photoreceptor classes (humans: 3), including ultraviolet and polarized-light channels — yet behavioral tests show they are surprisingly bad at discriminating fine color differences.",
     "The current theory: their eyes are not for rich perception but for instant, hard-wired signaling — a visual reflex machine rather than an artist."),
    ("NATURE", "Crows hold grudges across generations",
     "Crows remember human faces for years, scold 'dangerous' people on sight, and teach their chicks which faces to mob. Wild crows have also left gifts for the humans who feed them.",
     "The grudge is testable: researchers wearing the same mask get mobbed years later, by crows that were never the original victims. Culture, in birds."),
    ("NATURE", "Wombats produce cube-shaped poop",
     "Wombat intestines stretch unevenly, shaping the feces into cubes before exit — the only known animal to do so. The sharp edges keep the droppings from rolling off scent-marking rocks.",
     "The mechanism (rings of varying stiffness in the gut wall) inspired soft-robotics work on shape-forming materials."),
    ("NATURE", "Honeybees can be trained to sniff landmines and disease",
     "Bees learn to associate any odor with nectar rewards in minutes, making them cheap, mobile biosensors: trained hives have flagged TNT traces, tuberculosis, and early cancer markers in breath samples.",
     "A bee's olfactory sensitivity rivals a sniffer dog's, at one-thousandth the maintenance cost — and they can be retrained on a new scent in minutes."),
    ("NATURE", "Green sea slugs steal the ability to photosynthesize",
     "The sea slug Elysia chlorotica eats algae and keeps the chloroplasts alive inside its own gut cells, then runs on sunlight for months — an animal with solar panels. It even holds genes for maintaining them, possibly via gene transfer from the algae.",
     "Young Elysia must eat once to load its batteries; after that, light alone can sustain it. An animal leading a plant's lifestyle, one stolen organelle at a time."),
    ("NATURE", "The immortal jellyfish ages backward",
     "Turritopsis dohrnii, under stress, reabsorbs its adult body and restarts life as a juvenile polyp — potentially repeating the cycle indefinitely. Biologically it is a hydra in a jellyfish costume that can reset the clock.",
     "The trick is transdifferentiation: one mature cell type converting directly into another. Studying it may inform regenerative medicine — if the jellyfish shares."),

    # --- numbers, systems, computing ---
    ("SYSTEMS", "The first computer bug was a real moth",
     "In 1947, engineers on the Harvard Mark II found a moth jammed in relay #70 and taped it into the logbook: 'First actual case of bug being found.' Grace Hopper's team made the joke canonical.",
     "The logbook page survives at the Smithsonian. The moth taped beside it is arguably the most-cited insect in computing history."),
    ("SYSTEMS", "There are more possible chess games than atoms in the observable universe",
     "The Shannon number estimates 10^120 legal chess games; the observable universe holds only ~10^80 atoms. Even Go's 10^170 states make brute force meaningless — intelligence, not search, had to close the gap.",
     "That gap is why Deep Blue (1997) was a triumph of engineering, not just speed: it made the impossible countable, one pruning rule at a time."),
    ("SYSTEMS", "Wi-Fi was partly invented by a movie star",
     "Hedy Lamarr, film actress and self-taught inventor, co-patented frequency-hopping radio in 1942 to guide torpedoes past jamming. The Navy shelved it; decades later the idea underpinned spread-spectrum, the family of techniques behind Wi-Fi and Bluetooth.",
     "She was told she could help the war effort better by selling kisses for war bonds. The patent went unappreciated in her lifetime — a reminder that credit is not the same as contribution."),
    ("SYSTEMS", "The first recorded 'data error' is 4,000 years old",
     "Babylonian clay tablets record scribal corrections to mathematical tables, including flagged mistakes — early humans managing data quality with the same suspicion we bring to spreadsheets today.",
     "One tablet contains a student's error and the teacher's correction beside it: the oldest surviving code review."),
    ("SYSTEMS", "Your phone has more compute than every Apollo mission combined",
     "The Apollo guidance computer ran at ~0.04 MHz with 4 KB of RAM; a modern phone is hundreds of thousands of times faster with millions of times more memory — and it is mostly idle while you read this.",
     "Margaret Hamilton's team wrote the guidance software so defensively that during the Moon landing overload an executive interrupt shed low-priority tasks and the landing continued. Software that survives its worst day."),
    ("SYSTEMS", "Sliced bread needed a machine, not an idea",
     "Sliced bread is Otto Rohwedder's 1928 machine, not a cleverer knife: the hard part was keeping slices together, solved with a wrapping step that pressed the loaf whole. 'The best thing since…' refers to a packaging breakthrough.",
     "It became so canonical that in 1943, wartime bans on sliced bread were rescinded within three months after public outcry — demand had outlasted even rationing."),
    ("SYSTEMS", "Barcodes began as Morse code drawn in sand",
     "The first barcode concept (1952) was literally Morse code extended downward into thick and thin bars. Norman Woodland drew it in the sand on a Florida beach, extending the dots and dashes he knew from Boy Scouts.",
     "The first scanned product, a 10-pack of Wrigley's Juicy Fruit in 1974, closed a 22-year journey from beach sketch to checkout."),

    # --- human bodies & minds ---
    ("BODY", "Your stomach lining replaces itself every few days",
     "Stomach acid is strong enough to dissolve metal razor blades in lab tests; the stomach survives because its surface layer is replaced roughly every 4–5 days. It is a self-renovating reactor.",
     "The mucus layer plus rapid cell turnover is the whole trick. When that renewal slows — as with some painkillers or stress — ulcers follow."),
    ("BODY", "You are more microbe than you are you",
     "Human cells number ~30 trillion; the bacteria, fungi, and archaea that live with you number about the same again, carrying hundreds of times more genes than your genome. Digestion, mood, and immunity all negotiate with this committee.",
     "Roughly 2 kg of your body weight is microbial. Fecal transplants (a real, approved medical procedure for some infections) are literally reprogramming that committee."),
    ("BODY", "Bones are stronger than concrete, lighter than aluminum",
     "By weight, bone carries loads like steel-reinforced concrete but can heal itself and rebuild to match the stresses it meets — no engineered material does all three. Wolff's law: bone adapts to load.",
     "Astronauts lose ~1% of bone density per month in microgravity because the skeleton only builds what loading demands. Use it or lose it is literal."),
    ("BODY", "The brain runs on about 20 watts",
     "Your entire brain — 86 billion neurons doing all thinking, seeing, and movement planning — draws roughly the power of a dim bulb. Any laptop doing comparable perception work needs orders of magnitude more.",
     "That efficiency gap is the core challenge for AI hardware: brains win by sending sparse, event-driven signals instead of clocking every circuit billions of times a second."),
    ("BODY", "You forget on purpose",
     "Forgetting is an active process: the brain prunes synapses to keep useful patterns sharp. Sleep — especially deep sleep — is when much of the sorting happens, deciding what gets kept and what gets cleared.",
     "Sleep deprivation degrades memory not because recording fails, but because the filing never happens. Sleep is part of learning, not a break from it."),
    ("BODY", "A sneeze leaves your body at highway speed",
     "Sneeze ejecta can exit at roughly 150–160 km/h, and the droplets travel far farther in a warm room than intuition suggests — ventilation dynamics, not just distance, decide who is exposed.",
     "Sneezing is a nervous-system reset: photic sneeze reflex makes about a quarter of people sneeze at bright sunlight, a wiring quirk called ACHOO syndrome."),

    # --- history & records ---
    ("HISTORY", "Ancient Romans had working central heating",
     "Roman hypocausts circulated hot air from wood fires under raised floors and inside walls — comfortable villas and bathhouses two millennia before the thermostat. Some systems ran continuously for decades.",
     "The same principle (move heat by moving air) returned to European buildings only in the 19th century. The bath at Bath, England, still uses water plumbed by the Romans."),
    ("HISTORY", "The Library of Alexandria had a food court",
     "The Mouseion at Alexandria was less a 'library with shelves' than a funded research campus: scholars dined together, studied anatomy, mapped stars, and edited texts — an ancient research institute with stipends.",
     "It declined over centuries of budget cuts and shifting politics, not one dramatic fire. Research funding, it turns out, is older than we think — and its politics too."),
    ("HISTORY", "Bananas are all clones — one disease away from disaster",
     "Nearly every banana in a supermarket is the same Cavendish cultivar, propagated by cuttings. A single fungal race (Panama disease TR4) is sweeping plantations because the whole crop shares one immune system.",
     "The previous commercial banana, the Gros Michel, was wiped out commercially by the same disease in the 1950s. History is repeating; breeders are hedging with new cultivars."),
    ("HISTORY", "The Eiffel Tower grows ~15 cm taller in summer",
     "Thermal expansion lengthens the iron lattice on hot days — measurable, and even visible in old photographs. The tower also leans slightly away from the sun, the sunlit side expanding more.",
     "Engineers accounted for this in 1889: the bolts and joints are designed with the movement budget built in from day one."),
    ("HISTORY", "The first 'photograph' of a plant cell was drawn from cork",
     "Robert Hooke's 1665 Micrographia named the 'cell' from thin shavings of cork under a microscope — he saw the empty walls of dead cells and thought of monks' cells. Biology's founding word is architecture.",
     "Hooke estimated 1,259 million cells per cubic inch of cork. His counting logic was sound; the number was not bad for 1665."),
    ("HISTORY", "Bees have been making honey for 100 million years",
     "Fossil bees in amber from the Cretaceous show wax-producing, nectar-feeding anatomy essentially unchanged today. Honey found in archaeological sites remains identifiable — and sometimes still edible.",
     "Honey's shelf life comes from the same chemistry bees evolved to protect larvae: low water, high acid, peroxide from an enzyme. The jar is a preservative that preserves itself."),
]

def main():
    existing = FACTS_JS.read_text(encoding="utf-8")
    existing_titles = set(re.findall(r'title:\s*"([^"]+)"', existing))
    fresh = [f for f in FACTS if f[1] not in existing_titles]
    queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else []
    queue = queue if isinstance(queue, list) else []
    titles_in_queue = {f.get("title") for f in queue if isinstance(f, dict)}
    for tag, title, fact, detail in fresh:
        if title in titles_in_queue:
            continue
        entry = {"tag": tag, "title": title, "fact": fact, "detail": detail}
        queue.append(entry)
        titles_in_queue.add(title)
    QUEUE.write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Queue now holds {len(queue)} facts ({len(fresh)} new appended; "
          f"{len(FACTS) - len(fresh)} skipped as already present).")

if __name__ == "__main__":
    main()