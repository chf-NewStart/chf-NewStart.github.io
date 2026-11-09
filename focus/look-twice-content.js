/* Authored fictional everyday reasoning situations. Sources support the reasoning principles, not these fictional events. */
(function (root, factory) {
  const questions = factory();
  if (typeof module === 'object' && module.exports) module.exports = questions;
  if (root) root.TendLookTwiceContent = questions;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  return [
  {
    "id": "look-wet-path",
    "kind": "look-twice",
    "daily": true,
    "title": "A wet path and a timer",
    "concept": "Observation",
    "prompt": "At dawn you see water droplets on a garden path. A sprinkler log says “start command sent, 03:00.” Someone suggests this establishes that the sprinkler made the path wet. Which statement stays closest to the evidence?",
    "conditions": [
      "You did not observe the night. There is no rain record or record confirming that water left the sprinkler.",
      "The displayed log is genuine, but it records a command rather than measured water flow.",
      "Consider rain and sprinkler water as two possible explanations; neither is ruled out."
    ],
    "check": {
      "constant": "Water is on the path, and the controller recorded a start command.",
      "forces": "The sprinkler may have sprayed, rain may have fallen, or both may have happened.",
      "equilibrium": "A water-flow record and local rainfall observations would connect the proposed causes to the event."
    },
    "options": [
      {
        "id": "cause",
        "text": "The sprinkler definitely caused the wet path",
        "feedback": "The log establishes a command, not successful spraying or which source made this water."
      },
      {
        "id": "bounded",
        "text": "The wet path and command are observed; the source of the water is still unresolved",
        "feedback": "This separates the recorded observations from the explanation added to them."
      },
      {
        "id": "rain",
        "text": "It must have rained because the log does not confirm spraying",
        "feedback": "Failure to confirm the sprinkler is not confirmation of rain."
      }
    ],
    "answer": "bounded",
    "hints": [
      "Separate what the instruments recorded from what you think happened.",
      "Could a controller send a command when no water comes out?",
      "A plausible cause can fit an observation without being the only cause that fits."
    ],
    "explanation": [
      "The droplets establish that water is present at dawn.",
      "The log establishes that a start command was recorded. It does not establish water flow.",
      "Rain, successful spraying, or both remain compatible with the supplied evidence.",
      "The sprinkler explanation is plausible, but identifying the actual source needs further evidence."
    ],
    "changes": "A verified flow record, rainfall record, or direct observation of the relevant period could narrow the explanation. Evidence that a sprinkler can wet the path is weaker than evidence that it did so that night.",
    "sources": [
      {
        "title": "UC Berkeley Understanding Science: Observation",
        "url": "https://undsci.berkeley.edu/glossary/observe/"
      },
      {
        "title": "UC Berkeley Understanding Science: Testing scientific ideas",
        "url": "https://undsci.berkeley.edu/understanding-science-101/how-science-works/testing-scientific-ideas/"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "The next dry afternoon, you watch the sprinkler run and wet that same path. What does this new observation establish?",
      "conditions": [
        "There is no rain during this observed test.",
        "The test is on the same path, but the previous night was not observed."
      ],
      "check": {
        "constant": "Spraying during this test was directly observed to wet the path.",
        "forces": "The sprinkler can produce this outcome; the earlier night still has missing observations.",
        "equilibrium": "Separate evidence of capability from evidence about a particular past event."
      },
      "options": [
        {
          "id": "past",
          "text": "The sprinkler therefore caused the previous night’s wet path",
          "feedback": "A successful later test does not fill every gap in the earlier record."
        },
        {
          "id": "nothing",
          "text": "The test provides no information at all",
          "feedback": "It does establish that this sprinkler can produce the observed type of outcome."
        },
        {
          "id": "capability",
          "text": "The sprinkler can wet the path; this does not settle the previous night",
          "feedback": "The test supports a causal capability without reconstructing the unobserved event."
        }
      ],
      "answer": "capability",
      "hints": [
        "What happened in the test, and what period remains unobserved?",
        "A demonstration of “can” need not establish “did on that occasion.”"
      ],
      "explanation": [
        "The test directly supports the sprinkler’s ability to wet this path.",
        "It adds plausibility to the earlier explanation, but cannot by itself identify the source of the earlier water."
      ]
    },
    "reflectionPrompt": "How would you describe the observation and the proposed explanation in separate sentences?"
  },
  {
    "id": "look-two-plant-changes",
    "kind": "look-twice",
    "daily": true,
    "title": "Two changes in one pot",
    "concept": "Alternative explanations",
    "prompt": "Two similar seedlings begin at similar heights. One is moved closer to a window and is also watered more often. A week later it has grown more. Which follow-up most directly helps separate the effects of light and watering?",
    "conditions": [
      "The goal is to distinguish the effects of these two changes on growth in this setup.",
      "Several similar seedlings, measured water amounts, and two controlled light levels are available.",
      "The original comparison changed both factors together; other conditions were not fully recorded."
    ],
    "check": {
      "constant": "The seedling receiving both changes grew more during this week.",
      "forces": "Light, watering, their combination, or initial plant differences could contribute.",
      "equilibrium": "A comparison that varies the factors separately can expose effects hidden when both change together."
    },
    "options": [
      {
        "id": "repeat-pair",
        "text": "Repeat only the same two combined-care conditions with many more plants",
        "feedback": "More plants can improve consistency, but still cannot separate light from watering when they always change together."
      },
      {
        "id": "brighter",
        "text": "Give every plant extra water and move every plant to the window",
        "feedback": "There would be no comparison left for either factor."
      },
      {
        "id": "four-groups",
        "text": "Randomly assign seedlings to all four light-and-water combinations",
        "feedback": "This creates comparisons that vary one factor while holding the other at a specified level."
      }
    ],
    "answer": "four-groups",
    "hints": [
      "What is still mixed together if the two changes always travel as a pair?",
      "You can include lower and higher light at each watering level.",
      "The four combinations also let you notice if one factor’s effect depends on the other."
    ],
    "explanation": [
      "The original result compares combined care with earlier care, so it cannot isolate the two changes.",
      "Use both light levels at both watering levels, with several seedlings randomly assigned to each combination.",
      "Compare light levels at a fixed watering level, and watering levels at a fixed light level.",
      "This also allows a combined effect: one change might matter only when the other is present."
    ],
    "changes": "Temperature near the window, soil, plant age, measurement procedure, and losses of seedlings also need attention. A larger sample alone does not undo a confounded design.",
    "sources": [
      {
        "title": "Penn State STAT 200: Collecting data and study design",
        "url": "https://online.stat.psu.edu/stat200/Lesson01"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Two-level full factorial designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri3331.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "A follow-up instead keeps watering equal, randomly assigns many similar seedlings to two light levels, and repeats the comparison. The higher-light group consistently grows more. What has become more defensible?",
      "conditions": [
        "Light exposure is the intended difference; temperature, soil, and measurement are kept comparable.",
        "Consider only the species, light levels, and growth period tested."
      ],
      "check": {
        "constant": "A replicated, randomly assigned light comparison shows a growth difference.",
        "forces": "Light is now better separated from watering and initial group differences.",
        "equilibrium": "Look for whether the intended contrast was maintained across repetitions."
      },
      "options": [
        {
          "id": "bounded-light",
          "text": "Light affected growth under the tested conditions is better supported",
          "feedback": "The improved design reduces the particular alternatives that confused the first comparison."
        },
        {
          "id": "water-only",
          "text": "Watering must have been the original cause",
          "feedback": "The new comparison does not establish what caused the original two-change result."
        },
        {
          "id": "all-plants",
          "text": "More light must help every plant at every intensity",
          "feedback": "The tested result does not establish unlimited generalization or rule out harmful light levels."
        }
      ],
      "answer": "bounded-light",
      "hints": [
        "Which factor now differs deliberately between groups?",
        "A stronger causal inference can still have a limited scope."
      ],
      "explanation": [
        "The follow-up provides stronger evidence for a light effect in the conditions tested.",
        "It neither reconstructs every part of the original result nor establishes that all plants benefit from any increase in light."
      ]
    },
    "reflectionPrompt": "How would you explain what the first comparison mixed together, and what the follow-up separates?"
  },
  {
    "id": "look-camera-update",
    "kind": "look-twice",
    "daily": true,
    "title": "More birds, or a new counter?",
    "concept": "Measurement",
    "prompt": "A garden camera reports twice as many bird visits after a software update. Before concluding that visits increased, which available check most directly tests whether the counting rule changed?",
    "conditions": [
      "Archived video clips can be processed with both the old and new software.",
      "A visit should mean the same defined event in both versions, such as arrival after the bird was absent.",
      "The update and the reported increase began together; no independent visit count is yet available."
    ],
    "check": {
      "constant": "The reported count increased after an update.",
      "forces": "More real visits, a changed detector, or both could raise the number.",
      "equilibrium": "Process the same footage both ways so actual bird activity cannot explain a difference between versions."
    },
    "options": [
      {
        "id": "same-clips",
        "text": "Run both versions on the same archived clips and compare against a manual count",
        "feedback": "The same scenes hold bird activity fixed while the measurement process changes."
      },
      {
        "id": "new-week",
        "text": "Compare another week from the new version with an old week from the old version",
        "feedback": "That still changes both the time period and the software."
      },
      {
        "id": "bigger-number",
        "text": "Accept the larger count because newer software is always more accurate",
        "feedback": "A version number does not establish a consistent definition or accuracy."
      }
    ],
    "answer": "same-clips",
    "hints": [
      "Could the number change even if the footage did not?",
      "Choose a comparison where the birds are exactly the same.",
      "A manual count using a written visit definition can help check which software follows the intended rule."
    ],
    "explanation": [
      "The report is a measurement, produced by a particular counting process.",
      "Using identical clips removes changing bird activity as an explanation for differences between software versions.",
      "A manual count with a clear definition provides an additional reference for the intended event.",
      "If the versions count differently on the same clips, the before-and-after reports are not directly comparable without further work."
    ],
    "changes": "Both actual activity and software can change together. Establishing a software effect does not show that all of the apparent increase is a software effect.",
    "sources": [
      {
        "title": "NIST Engineering Statistics Handbook: Calibration",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc3.htm"
      },
      {
        "title": "OpenStax Introductory Statistics 2e: Sampling and variation",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "On identical clips, the old version and the new version each match the same manual count. Does this establish that the garden’s real visit rate doubled after the update?",
      "conditions": [
        "The checked clips cover several relevant scenes, but the camera’s operating time also changed.",
        "Before the update it recorded 4 hours daily; afterward it recorded 8 hours daily."
      ],
      "check": {
        "constant": "The counting versions agree on the checked footage, while daily recording time doubled.",
        "forces": "More observation time can produce more counted visits even without a higher visit rate.",
        "equilibrium": "Compare counts per active recording hour using comparable periods."
      },
      "options": [
        {
          "id": "yes",
          "text": "Yes; agreement between versions proves the garden had twice the visit rate",
          "feedback": "It checks the counter, but not the unequal observation time."
        },
        {
          "id": "hours",
          "text": "No; compare visits per active recording hour before inferring a rate change",
          "feedback": "Twice the counting exposure can explain twice the total without a rate increase."
        },
        {
          "id": "software",
          "text": "No; the software must still be the entire cause",
          "feedback": "Agreement on the checked clips weakens that specific explanation, and observation time supplies another."
        }
      ],
      "answer": "hours",
      "hints": [
        "What opportunity did the camera have to record visits on each day?",
        "A count and a rate use different denominators."
      ],
      "explanation": [
        "The software check addresses one measurement concern.",
        "Unequal recording time remains. A rate comparison needs an appropriate time denominator and comparable observation periods."
      ]
    },
    "reflectionPrompt": "How would you explain why a number can change when the thing being counted has not changed?"
  },
  {
    "id": "look-bakery-baseline",
    "kind": "look-twice",
    "daily": true,
    "title": "Two ways to say “sold more”",
    "concept": "Comparison",
    "prompt": "A bakery puts out 15 rye loaves and sells 12, while putting out 60 oat loaves and selling 18. Which statement correctly distinguishes units sold from the fraction of stock sold?",
    "conditions": [
      "These are complete counts for the same selling period; no stock is added, discarded, or reserved.",
      "Both kinds stay available throughout the period, so neither runs out.",
      "Ask about these recorded quantities, not customers’ unobserved preferences or profit."
    ],
    "check": {
      "constant": "Rye sold 12 of 15; oat sold 18 of 60.",
      "forces": "A larger number sold and a larger fraction of stock sold are different comparisons.",
      "equilibrium": "State the denominator appropriate to the particular claim."
    },
    "options": [
      {
        "id": "rye-both",
        "text": "Rye sold both more units and a larger fraction",
        "feedback": "Rye has the larger fraction, but 12 units is fewer than 18."
      },
      {
        "id": "oat-both",
        "text": "Oat sold both more units and a larger fraction",
        "feedback": "Oat has the larger count, but 18 of 60 is a smaller fraction than 12 of 15."
      },
      {
        "id": "different",
        "text": "Oat sold more units; rye sold a larger fraction of its stock",
        "feedback": "The absolute count and the proportion answer different questions."
      }
    ],
    "answer": "different",
    "hints": [
      "First compare 12 with 18 without using starting stock.",
      "Then compare 12/15 with 18/60.",
      "A statement about demand or preference would require more than these two sales summaries."
    ],
    "explanation": [
      "Eighteen oat loaves is more units than twelve rye loaves.",
      "Rye sold 12/15, or 80%, of its stock. Oat sold 18/60, or 30%.",
      "Rye therefore had higher sell-through even though oat had higher unit sales.",
      "Neither summary alone establishes why customers chose a loaf, or what would happen with different stock, prices, or display positions."
    ],
    "changes": "If an item sells out, observed sales can be limited by supply. Availability, prices, customer exposure, and restocking can change which comparison answers the intended question.",
    "sources": [
      {
        "title": "OpenStax Introductory Statistics 2e: Frequency and relative frequency",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-3-frequency-frequency-tables-and-levels-of-measurement"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "Change the counts: both kinds start with 20 loaves; rye sells 12 and oat sells 18, with neither selling out. Which has the higher unit count and the higher fraction sold?",
      "conditions": [
        "There is no restocking, discarding, or reservation.",
        "Compare only the recorded sales and stock for this period."
      ],
      "check": {
        "constant": "Both denominators now equal 20.",
        "forces": "With equal starting stock, ordering the counts also orders the fractions.",
        "equilibrium": "Keep the same denominator for both comparisons."
      },
      "options": [
        {
          "id": "oat",
          "text": "Oat has both higher unit sales and higher sell-through",
          "feedback": "The denominators match, so the larger count also gives the larger fraction."
        },
        {
          "id": "rye",
          "text": "Rye has higher sell-through because it did in the first situation",
          "feedback": "The changed data require a new comparison rather than transferring the earlier conclusion."
        },
        {
          "id": "cannot",
          "text": "Neither comparison is possible from these counts",
          "feedback": "The needed counts and denominators are now explicitly supplied."
        }
      ],
      "answer": "oat",
      "hints": [
        "What changed about the starting stock?",
        "Compare 12/20 with 18/20."
      ],
      "explanation": [
        "Oat sells more units: 18 rather than 12.",
        "Its fraction sold is also higher: 90% rather than 60%, because the initial stock is equal."
      ]
    },
    "reflectionPrompt": "How would you rewrite “sold better” as two precise claims with different denominators?"
  },
  {
    "id": "look-feeder-hours",
    "kind": "look-twice",
    "daily": true,
    "title": "The feeder with more visits",
    "concept": "Comparison",
    "prompt": "A camera counts 30 visits to a blue feeder during 3 active recording hours and 10 visits to a red feeder during 1 active recording hour. For these observations, which rate comparison is justified?",
    "conditions": [
      "A visit is defined and counted the same way for both feeders.",
      "Use only each camera’s active recording time; neither camera missed a visit during its active period.",
      "The observation periods and feeder locations were not matched or randomly assigned."
    ],
    "check": {
      "constant": "The blue feeder has 30 visits in 3 hours; red has 10 in 1 hour.",
      "forces": "Total counts reflect both visit frequency and how long observations lasted.",
      "equilibrium": "Divide by observed time, then separate this description from a claim about color preference."
    },
    "options": [
      {
        "id": "blue-rate",
        "text": "Blue has three times the observed visits per hour",
        "feedback": "It has three times the visits, but also three times the active observation time."
      },
      {
        "id": "equal-rate",
        "text": "Both have 10 observed visits per active hour; this does not establish equal color preference",
        "feedback": "The rates match in these records, while unmatched periods and locations limit an explanation."
      },
      {
        "id": "red-rate",
        "text": "Red has the higher rate because its record is shorter",
        "feedback": "Shorter recording time alone does not imply a higher rate; the visit count must also be considered."
      }
    ],
    "answer": "equal-rate",
    "hints": [
      "Ask how many visits were counted per hour, not just in total.",
      "Thirty divided by three and ten divided by one give the same value.",
      "Equal measured rates do not automatically remove differences in time of day or location."
    ],
    "explanation": [
      "Blue’s observed rate is 30/3 = 10 visits per active hour.",
      "Red’s observed rate is 10/1 = 10 visits per active hour.",
      "These records therefore have equal observed rates.",
      "Inferring a color effect would require a design that deals with feeder location, time of day, food, and other relevant differences."
    ],
    "changes": "A visit rate can vary over the day. Matching total recording time alone is not enough if one feeder is observed only during a busy period.",
    "sources": [
      {
        "title": "OpenStax Introductory Statistics 2e: Frequency and relative frequency",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-3-frequency-frequency-tables-and-levels-of-measurement"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Completely randomized designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "To study color rather than location, two identical feeders with the same food can be repainted and filmed at the same times. Which added design feature most directly separates color from a fixed location advantage?",
      "conditions": [
        "There are two fixed positions, one of which might attract more birds regardless of feeder color.",
        "The goal is the effect of color on visit rate under these conditions."
      ],
      "check": {
        "constant": "A location difference could masquerade as a color difference.",
        "forces": "Color and position need not have the same effect.",
        "equilibrium": "Make each color appear in each position across repeated, scheduled comparisons."
      },
      "options": [
        {
          "id": "fixed",
          "text": "Keep blue permanently in one position and film for longer",
          "feedback": "That preserves the color–position confounding, however many visits are recorded."
        },
        {
          "id": "one-day",
          "text": "Use only the single day with the biggest color difference",
          "feedback": "Selecting an extreme day does not separate color from location."
        },
        {
          "id": "rotate",
          "text": "Randomize and balance which color occupies each position across repeated paired periods",
          "feedback": "This lets each color experience both positions instead of always sharing one location’s advantage."
        }
      ],
      "answer": "rotate",
      "hints": [
        "Can each color be observed in both positions?",
        "A longer record cannot separate factors that never vary apart."
      ],
      "explanation": [
        "Repeated paired observations help compare the same times.",
        "Balancing and randomizing color assignments across positions breaks the permanent link between color and a particular location."
      ]
    },
    "reflectionPrompt": "How would you distinguish “same observed rate” from “same underlying preference”?"
  },
  {
    "id": "look-late-bus-photos",
    "kind": "look-twice",
    "daily": true,
    "title": "The photos people posted",
    "concept": "Sampling",
    "prompt": "A noticeboard contains 40 verified photos of late buses from a week with 500 scheduled bus departures. Each photo shows a different departure. What does the noticeboard establish about the week’s late departures?",
    "conditions": [
      "The photos are genuine and all 40 departures were late by the same definition.",
      "People chose which departures to photograph and post. There is no full lateness record.",
      "All 500 scheduled departures occurred; count lateness, not cancellations."
    ],
    "check": {
      "constant": "At least 40 distinct departures out of 500 were late.",
      "forces": "Other departures may have been late without attracting a photo; posting is selective.",
      "equilibrium": "A complete record or an appropriate sample of departures is needed for an overall rate."
    },
    "options": [
      {
        "id": "lower-bound",
        "text": "At least 8% were late; the exact fraction is not determined",
        "feedback": "Forty verified late departures gives a lower bound, while unposted departures remain unknown."
      },
      {
        "id": "exact",
        "text": "Exactly 8% were late",
        "feedback": "This treats the unposted departures as on time, which was never established."
      },
      {
        "id": "no-information",
        "text": "The photos provide no information because they were self-selected",
        "feedback": "They do verify some late departures. The limitation concerns how far that evidence can be generalized."
      }
    ],
    "answer": "lower-bound",
    "hints": [
      "What do verified examples establish even when the selection is biased?",
      "Forty distinct departures out of five hundred gives a minimum fraction.",
      "A missing photo is not a record of an on-time bus."
    ],
    "explanation": [
      "The verified photos establish 40 late departures.",
      "Forty out of 500 equals 8%, so the true fraction for the week cannot be below that.",
      "Some unposted departures could also have been late, so 8% is not established as the exact fraction.",
      "Self-selected records can establish that events occurred without providing a representative estimate of their frequency."
    ],
    "changes": "Duplicate photos, uncertain timestamps, differing definitions of late, or missing scheduled departures would change even the lower-bound calculation.",
    "sources": [
      {
        "title": "OpenStax Introductory Statistics 2e: Sampling and variation",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "A separate audit now selects 80 of the week’s 500 departures at random from the full list and checks complete records. Twenty of the sampled departures were late. Which claim fits that audit?",
      "conditions": [
        "Every departure had the same chance of selection and the selected records are complete.",
        "Ask what the sample shows and what it estimates about this particular week."
      ],
      "check": {
        "constant": "Twenty of the 80 randomly sampled departures were late.",
        "forces": "The sample fraction can differ from the full week’s fraction by sampling variation.",
        "equilibrium": "Distinguish the exact sample percentage from an estimate for all departures."
      },
      "options": [
        {
          "id": "exact-week",
          "text": "Exactly 25% of all 500 departures were late",
          "feedback": "A random sample still has uncertainty; its fraction need not equal the population fraction exactly."
        },
        {
          "id": "estimate",
          "text": "The sample is 25% late and offers an estimate, not an exact census percentage",
          "feedback": "Random selection improves the basis for estimating the week’s rate without making the sample a census."
        },
        {
          "id": "irrelevant",
          "text": "The sample is no more useful than selectively posted late photos",
          "feedback": "Its selection does not deliberately depend on whether a departure was late."
        }
      ],
      "answer": "estimate",
      "hints": [
        "Which denominator belongs to the 20 observed late departures?",
        "Random sampling reduces selection problems without eliminating sampling variation."
      ],
      "explanation": [
        "The sample fraction is exactly 20/80 = 25%.",
        "It provides a defensible estimate of the week’s late fraction, with sampling uncertainty rather than a guarantee of exact equality."
      ]
    },
    "reflectionPrompt": "How would you explain the difference between evidence that some events happened and evidence about how often they happened?"
  },
  {
    "id": "look-seed-light-trial",
    "kind": "look-twice",
    "daily": true,
    "title": "A result worth taking seriously",
    "concept": "Causal evidence",
    "prompt": "A club randomly assigns many seeds from one batch to two light schedules. Water, temperature, soil, and measurement are kept comparable. Repeated trials show more seeds germinating under schedule A. Which conclusion fits the design without going beyond it?",
    "conditions": [
      "The assignments are genuinely random and all assigned seeds are included in the counts.",
      "The trials are conducted as described, with differences large and consistent compared with the trial-to-trial variation.",
      "Only these seed types, the tested schedules, and the stated germination period have been studied."
    ],
    "check": {
      "constant": "Repeated randomized comparisons find higher germination under schedule A.",
      "forces": "The intended light-schedule contrast is better separated from initial seed and care differences.",
      "equilibrium": "Check the maintained conditions, full outcome record, repeatability, and limits of the tested setting."
    },
    "options": [
      {
        "id": "nothing",
        "text": "No causal interpretation is possible because all experiments can have uncertainty",
        "feedback": "Uncertainty does not make a carefully controlled, replicated intervention uninformative."
      },
      {
        "id": "bounded-cause",
        "text": "The evidence supports a light-schedule effect on germination in this tested setting",
        "feedback": "Random assignment, comparable care, and replication strengthen this limited causal conclusion."
      },
      {
        "id": "universal",
        "text": "Schedule A must be best for every species and growing condition",
        "feedback": "The study did not test every species, light level, temperature, or meaning of “best.”"
      }
    ],
    "answer": "bounded-cause",
    "hints": [
      "What did the club deliberately vary, and what did it keep comparable?",
      "Random assignment helps prevent initial group differences from consistently tracking the schedule.",
      "A result can support a cause within tested conditions without establishing a universal rule."
    ],
    "explanation": [
      "This is an intervention: the club assigns light schedules rather than merely observing where seeds happen to grow.",
      "Random assignment reduces systematic initial group differences, while the care controls address specified alternatives.",
      "A substantial, repeated difference supports a causal effect of the schedule in this setting.",
      "The conclusion remains limited to the tested seeds, schedules, conditions, and outcome period; the exact biological mechanism needs separate evidence."
    ],
    "changes": "Unequal losses, misrecorded assignments, unnoticed care differences, or inconsistent results would weaken the inference. Testing a broader range of conditions would inform generalization.",
    "sources": [
      {
        "title": "Penn State STAT 200: Collecting data and study design",
        "url": "https://online.stat.psu.edu/stat200/Lesson01"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Completely randomized designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm"
      },
      {
        "title": "National Academies: Decoding Science — repetition and evidence",
        "url": "https://nap.nationalacademies.org/resource/25303/interactive/"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "Change the design: seeds under A are all from a fresh batch; seeds under B are all from an older batch. The germination difference remains. What changes about the conclusion?",
      "conditions": [
        "The batches were not randomly split across schedules.",
        "Batch age could influence germination; the other stated care conditions are comparable."
      ],
      "check": {
        "constant": "Schedule and seed batch now vary together.",
        "forces": "Either schedule, seed-batch differences, or both could explain the result.",
        "equilibrium": "Split each batch randomly across both schedules to separate these factors."
      },
      "options": [
        {
          "id": "confounded",
          "text": "The difference no longer cleanly separates light schedule from seed batch",
          "feedback": "Repeated measurements of the same mixed comparison do not remove the confounding."
        },
        {
          "id": "same-strength",
          "text": "Nothing changes; the observed difference is identical",
          "feedback": "The same result can have a different evidential meaning when the design changes."
        },
        {
          "id": "age-proven",
          "text": "The older batch is therefore established as the cause",
          "feedback": "Batch age is now an alternative explanation, not an isolated cause established by the comparison."
        }
      ],
      "answer": "confounded",
      "hints": [
        "Which two properties now always occur together?",
        "Could either property explain the group difference?"
      ],
      "explanation": [
        "Light schedule and batch are confounded in this version.",
        "The observed difference still matters, but the comparison cannot isolate their separate effects."
      ]
    },
    "reflectionPrompt": "How would you explain why this evidence can be useful without making its conclusion universal?"
  },
  {
    "id": "look-fan-and-microphone",
    "kind": "look-twice",
    "daily": true,
    "title": "Sound, or the shared power supply?",
    "concept": "Testing explanations",
    "prompt": "A microphone’s noise reading rises whenever a desk fan runs. Two explanations are proposed: audible fan sound, or electrical interference through their shared power supply. Which available test most directly separates these two explanations?",
    "conditions": [
      "The fan can run from an electrically separate battery pack at the same verified speed.",
      "Microphone, fan position, room, recording settings, and blade speed can be kept unchanged. An independent battery-powered reference recorder can check that actual fan sound stays comparable.",
      "The target is the shared-power explanation versus airborne fan sound; do not assume these are the only possible mechanisms."
    ],
    "check": {
      "constant": "Turning on the fan is associated with a higher microphone reading.",
      "forces": "Fan sound and shared-power interference would both fit that observation.",
      "equilibrium": "Change the electrical connection while keeping the fan’s sound-producing operation comparable."
    },
    "options": [
      {
        "id": "move-away",
        "text": "Move the fan farther away while changing its power supply too",
        "feedback": "Both acoustic exposure and the electrical path change, so an improvement cannot separate them."
      },
      {
        "id": "more-repeats",
        "text": "Repeat the original shared-power on/off comparison many times",
        "feedback": "A repeatable association still fits both of the proposed explanations."
      },
      {
        "id": "separate-power",
        "text": "Run the fan from the separate battery, checking speed, position, and actual sound stay comparable",
        "feedback": "This changes the proposed shared-power path while the independent sound check guards against changing acoustic output too."
      }
    ],
    "answer": "separate-power",
    "hints": [
      "Ask what the two explanations predict differently.",
      "Can you remove the shared electrical path without also removing the fan’s sound?",
      "A discriminating test changes a factor on which the explanations disagree."
    ],
    "explanation": [
      "The original on/off observation changes both audible fan operation and possible electrical interference.",
      "Separate battery power removes the specified shared-supply path. Speed and placement controls plus the independent sound check help keep acoustic exposure comparable.",
      "A drop in the noise reading would support a contribution from that electrical path; an unchanged reading would weaken that specific explanation.",
      "Neither outcome automatically identifies every source of the remaining signal or proves one exclusive mechanism."
    ],
    "changes": "If fan speed, position, microphone settings, or acoustic conditions change too, the test becomes harder to interpret. Other electrical paths or a mixture of sound and interference may remain.",
    "sources": [
      {
        "title": "UC Berkeley Understanding Science: Testing scientific ideas",
        "url": "https://undsci.berkeley.edu/understanding-science-101/how-science-works/testing-scientific-ideas/"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Completely randomized designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "With separate fan power, the extra noise becomes smaller but does not disappear. The controls are maintained. Which account remains compatible?",
      "conditions": [
        "The change is reproducible across repeated comparisons.",
        "The microphone and fan keep the same placement, speed, and recording settings; the independent recorder confirms comparable actual fan sound."
      ],
      "check": {
        "constant": "Removing shared power reduces, but does not eliminate, the extra signal.",
        "forces": "The shared supply may contribute alongside airborne sound or another source.",
        "equilibrium": "Further tests should isolate the remaining pathways rather than force a single-cause story."
      },
      "options": [
        {
          "id": "sound-ruled-out",
          "text": "Airborne fan sound is ruled out because the reading fell",
          "feedback": "An electrical contribution can coexist with an acoustic contribution."
        },
        {
          "id": "mixture",
          "text": "A mixture of contributions remains possible",
          "feedback": "A partial reduction fits a shared-power contribution plus sound or another remaining pathway."
        },
        {
          "id": "power-ruled-out",
          "text": "Shared power is ruled out because some extra noise remains",
          "feedback": "A contributing cause need not explain the entire signal."
        }
      ],
      "answer": "mixture",
      "hints": [
        "Must one explanation account for the entire effect?",
        "Removing one contribution can leave another."
      ],
      "explanation": [
        "The reproducible reduction supports some role for the removed electrical path under these controls.",
        "The remaining signal could include sound or another source. The data do not require a single exclusive explanation."
      ]
    },
    "reflectionPrompt": "How would you explain what the power-supply test changes and what it deliberately leaves comparable?"
  },
  {
    "id": "look-printer-reset",
    "kind": "look-twice",
    "daily": true,
    "title": "After the worst day",
    "concept": "Variation",
    "prompt": "A printer’s smudge count varies from day to day. After its worst day in months, someone restarts it. The next day has fewer smudges. What is the strongest conclusion from this one before-and-after comparison?",
    "conditions": [
      "The restart was chosen because that day was unusually bad.",
      "Daily counts vary even during periods with no restart. Page mix and other day-to-day conditions were not controlled.",
      "There is no comparable no-restart day or repeated restart experiment in this record."
    ],
    "check": {
      "constant": "An unusually high count was followed by a restart and then a lower count.",
      "forces": "The restart, ordinary variation, a different page mix, or a combination could explain the improvement.",
      "equilibrium": "Compare repeated, planned restart and no-restart conditions instead of selecting only extreme starting days."
    },
    "options": [
      {
        "id": "uncertain-cause",
        "text": "The improvement is real in the record, but its cause is not established",
        "feedback": "An extreme starting observation can be followed by a less extreme one without the intervening action causing the change."
      },
      {
        "id": "guaranteed-reset",
        "text": "The restart caused the entire improvement",
        "feedback": "The single sequence does not isolate the restart from variation or other changes."
      },
      {
        "id": "guaranteed-chance",
        "text": "The restart definitely had no effect; improvement was inevitable",
        "feedback": "Regression toward a typical value is a tendency under appropriate conditions, not a guarantee or proof that an action cannot help."
      }
    ],
    "answer": "uncertain-cause",
    "hints": [
      "Why was this particular starting day selected?",
      "If daily counts fluctuate, an exceptionally high value need not recur even without an intervention.",
      "A change after an action is not yet a comparison with what would have happened without that action."
    ],
    "explanation": [
      "The record establishes a lower count after the restart, but no matched alternative outcome.",
      "Selecting the worst day makes ordinary movement back toward a more typical count an important alternative to consider.",
      "Uncontrolled page mix and other daily conditions add further possibilities.",
      "The restart might help, have no effect, or contribute partly. Repeated planned comparisons are needed to estimate its effect."
    ],
    "changes": "A controlled repeated comparison can provide stronger evidence. A continuing mechanical fault or a shifting workload can also make a simple stable-variation explanation inappropriate.",
    "sources": [
      {
        "title": "UC Berkeley, Philip Stark: The regression effect and regression fallacy",
        "url": "https://www.stat.berkeley.edu/~stark/SticiGui/Text/regressionErrors.htm"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Measurement variability",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section1/mpc114.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "A later test assigns comparable print batches at random to restart or no-restart conditions, records every batch, and repeats the comparison. Restart batches consistently have fewer smudges. How should this affect the earlier uncertainty?",
      "conditions": [
        "The print content, supplies, settings, and measurement are kept comparable.",
        "The repeated difference is large relative to ordinary batch-to-batch variation."
      ],
      "check": {
        "constant": "A planned randomized comparison repeatedly favors restarting.",
        "forces": "The restart is better separated from extreme-day selection and workload differences.",
        "equilibrium": "Evaluate the controlled difference and whether it repeats, while keeping the tested scope in view."
      },
      "options": [
        {
          "id": "never",
          "text": "It cannot help because the first comparison was weak",
          "feedback": "Weak earlier evidence does not prevent stronger later evidence from changing the conclusion."
        },
        {
          "id": "always",
          "text": "It proves every future smudge can be prevented by restarting",
          "feedback": "The test supports a bounded effect, not a guarantee for all faults and future conditions."
        },
        {
          "id": "supports",
          "text": "It strengthens evidence that restarting affects smudging in these conditions",
          "feedback": "The new design addresses important alternatives left open by the earlier sequence."
        }
      ],
      "answer": "supports",
      "hints": [
        "What alternatives did the new design address?",
        "Updating a conclusion is appropriate when the evidence improves."
      ],
      "explanation": [
        "Random assignment and comparable batches make the new contrast more informative about the restart.",
        "The repeated result strengthens a causal explanation under the tested conditions, without making a universal guarantee."
      ]
    },
    "reflectionPrompt": "How would you explain why a better day after a restart is worth noticing but is not yet a controlled test?"
  },
  {
    "id": "look-paper-plane-order",
    "kind": "look-twice",
    "daily": true,
    "title": "The afternoon airplane",
    "concept": "Replication",
    "prompt": "Two paper-airplane designs are compared indoors. All ten flights of A happen in the morning; all ten flights of B in the afternoon. B flies farther. Which follow-up most directly addresses a possible time-of-day or practice effect?",
    "conditions": [
      "The goal is to compare the designs using the same thrower, launch procedure, and measured distance.",
      "Several replicas of each design can be made from the same paper batch.",
      "The original tests did not record room airflow changes or the thrower’s increasing familiarity."
    ],
    "check": {
      "constant": "B’s afternoon flights went farther than A’s morning flights.",
      "forces": "Design, changing airflow, increasing practice, or fatigue could be involved.",
      "equilibrium": "Interleave designs across the same test periods rather than tying each design to one part of the day."
    },
    "options": [
      {
        "id": "more-same-order",
        "text": "Do one hundred A flights first, followed by one hundred B flights",
        "feedback": "More flights do not break the permanent link between design and test order."
      },
      {
        "id": "interleave",
        "text": "Repeat with several replicas and a randomized, balanced sequence of A and B flights",
        "feedback": "Both designs then share the test periods, reducing a fixed link with time or practice."
      },
      {
        "id": "best-only",
        "text": "Compare only each design’s single longest flight",
        "feedback": "Selecting the best outcomes discards the variation the comparison needs."
      }
    ],
    "answer": "interleave",
    "hints": [
      "What factor always accompanies design A in the original test? What accompanies B?",
      "A repeat can preserve a bias if the order stays the same.",
      "Both designs should be represented throughout the run, with the sequence chosen independently of their results."
    ],
    "explanation": [
      "The original design comparison is also a morning-versus-afternoon comparison.",
      "Randomizing and balancing flight order spreads time, practice, and fatigue influences across the designs.",
      "Several independently made planes help avoid mistaking one unusual construction for the design’s general behavior.",
      "Keep all flight results and a consistent measurement rule instead of selecting only impressive flights."
    ],
    "changes": "Randomization does not guarantee identical conditions on every flight. Replicas, recorded conditions, and repeated runs help assess remaining variation and the scope of the finding.",
    "sources": [
      {
        "title": "NIST Engineering Statistics Handbook: Completely randomized designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm"
      },
      {
        "title": "National Academies: Decoding Science — repetition and evidence",
        "url": "https://nap.nationalacademies.org/resource/25303/interactive/"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "Two groups run the improved comparison and obtain small differences in opposite directions. What is the most useful next step before declaring a design winner?",
      "conditions": [
        "Both groups report all flights and their methods; neither difference is large relative to flight-to-flight spread.",
        "They can compare the recorded conditions and repeat a shared procedure."
      ],
      "check": {
        "constant": "The estimated differences are small and not in the same direction.",
        "forces": "Ordinary variation or differences in construction and procedure may explain the mismatch.",
        "equilibrium": "Inspect methods and the full spread of results, then repeat a shared comparison."
      },
      "options": [
        {
          "id": "audit-repeat",
          "text": "Compare methods and variability, then repeat a common planned procedure",
          "feedback": "This uses the disagreement to investigate uncertainty and possible condition differences."
        },
        {
          "id": "larger",
          "text": "Automatically choose the group with the single longest flight",
          "feedback": "A maximum does not settle a small and variable average comparison."
        },
        {
          "id": "impossible",
          "text": "At least one set of results must be impossible",
          "feedback": "Small effects can produce differing observed directions without either record being invalid."
        }
      ],
      "answer": "audit-repeat",
      "hints": [
        "How large are the differences compared with ordinary flight variation?",
        "Disagreement can reveal uncertainty or condition differences worth investigating."
      ],
      "explanation": [
        "The records do not show a large, stable difference.",
        "Checking procedure and variation, followed by a shared replication, is more informative than selecting a winner from the most striking flight."
      ]
    },
    "reflectionPrompt": "How would you explain why repeating a test can help only if the design and full results are also considered?"
  },
  {
    "id": "look-missing-counter",
    "kind": "look-twice",
    "daily": true,
    "title": "A blank is not a zero",
    "concept": "Measurement",
    "prompt": "A doorway counter’s dashboard has no entry between 14:00 and 15:00. Someone reports that nobody used the doorway during that hour. Which follow-up is most directly relevant before accepting the claim?",
    "conditions": [
      "The dashboard can be blank either when it receives no data or when an hour has not yet been processed.",
      "The system normally displays an explicit numeric zero after a healthy completed hour with no detections.",
      "Device uptime, upload status, and the raw detection log are available to inspect."
    ],
    "check": {
      "constant": "The dashboard entry is absent, rather than an explicit zero.",
      "forces": "No detections, an outage, an upload problem, or delayed processing could produce the missing display.",
      "equilibrium": "Check whether the observation system actually covered and processed the hour."
    },
    "options": [
      {
        "id": "check-coverage",
        "text": "Check uptime, raw detections, and processing status for the missing hour",
        "feedback": "This tests whether an observation was made and whether a count was successfully reported."
      },
      {
        "id": "assume-zero",
        "text": "Treat the blank as zero because both look empty",
        "feedback": "The dashboard’s stated conventions distinguish no recorded value from a completed zero count."
      },
      {
        "id": "ask-later",
        "text": "Wait until tomorrow and assume any remaining blank means nobody came",
        "feedback": "A persistent missing value still does not establish functioning coverage."
      }
    ],
    "answer": "check-coverage",
    "hints": [
      "What would a healthy zero look like in this system?",
      "Could the counter fail to report while people still pass?",
      "Before interpreting a result, establish whether the measurement is present and complete."
    ],
    "explanation": [
      "A missing dashboard value is not the same data state as an explicit zero.",
      "The stated system can omit an entry because measurement, transfer, or processing is incomplete.",
      "Uptime and raw-log checks help establish what was actually observed.",
      "Until coverage is established, the blank cannot support the claim that no one passed."
    ],
    "changes": "If a system is explicitly designed so that a blank reliably encodes a completed zero, its documentation would change the interpretation. Even then, a zero detection count is limited by detector performance.",
    "sources": [
      {
        "title": "Statistics Canada: Standard table symbols — unavailable values and zero",
        "url": "https://www.statcan.gc.ca/en/concepts/definitions/guide-symbol"
      },
      {
        "title": "OpenStax Introductory Statistics 2e: Sampling and variation",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Calibration",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc3.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "The checks confirm healthy coverage and completed processing. The raw log contains zero detections, and the dashboard now displays 0. Which statement is justified?",
      "conditions": [
        "The counter’s detection process is functioning as specified, but it can still miss some kinds of passage.",
        "No independent complete record of every person passing is available."
      ],
      "check": {
        "constant": "A functioning counter recorded zero detections during a covered hour.",
        "forces": "Zero recorded detections need not equal zero actual passages if misses are possible.",
        "equilibrium": "Detector sensitivity or an independent observation would help bridge recorded events and actual events."
      },
      "options": [
        {
          "id": "nobody",
          "text": "It is certain that nobody passed",
          "feedback": "The conditions explicitly allow missed passages."
        },
        {
          "id": "recorded-zero",
          "text": "The system recorded zero detections; the stronger “nobody passed” claim still depends on detection reliability",
          "feedback": "This reports the actual record while acknowledging the supplied possibility of misses."
        },
        {
          "id": "still-blank",
          "text": "The record is still missing, so nothing changed",
          "feedback": "Coverage and an explicit zero have now been established; that is useful new information."
        }
      ],
      "answer": "recorded-zero",
      "hints": [
        "What exactly was counted: people, or detections of people?",
        "Healthy operation can still have a known detection limit."
      ],
      "explanation": [
        "The missing-data concern has been resolved: there is a completed observation with zero detections.",
        "Whether zero detections establishes zero actual passages depends on the detector’s ability to catch every relevant passage."
      ]
    },
    "reflectionPrompt": "How would you explain the difference among no observation, a recorded zero, and certainty that nothing happened?"
  },
  {
    "id": "look-umbrellas-and-paths",
    "kind": "look-twice",
    "daily": true,
    "title": "Two things that rise together",
    "concept": "Alternative explanations",
    "prompt": "Across many days, a park record shows that umbrella sightings and wet paths tend to occur together. A suggestion is that umbrellas make the paths wet. Which alternative causal story could produce the same association without that direct effect?",
    "conditions": [
      "Only the association is supplied; no experiment changed umbrella use.",
      "Local rainfall could influence both the condition of paths and whether umbrellas appear.",
      "Ask for a compatible alternative explanation, not proof of the actual mechanism."
    ],
    "check": {
      "constant": "Days with more umbrella sightings tend to have wetter paths.",
      "forces": "Rain could produce both more umbrellas and wetter paths, without umbrellas causing the wetness.",
      "equilibrium": "Measurements and comparisons of rainfall can help assess the shared-cause explanation."
    },
    "options": [
      {
        "id": "reverse",
        "text": "The association alone proves that wet paths cause umbrellas to appear",
        "feedback": "Reversing a causal arrow does not make it established by the same association."
      },
      {
        "id": "no-cause",
        "text": "If a shared cause is possible, neither variable can have any cause",
        "feedback": "A shared cause is itself a causal explanation; it does not mean nothing is caused."
      },
      {
        "id": "shared-rain",
        "text": "Rain could be a shared cause of umbrella use and wet paths",
        "feedback": "A common cause can create a relationship between two observations without one directly causing the other."
      }
    ],
    "answer": "shared-rain",
    "hints": [
      "Can a third condition influence both observations?",
      "What can make a path wet and also make umbrellas more common?",
      "A compatible alternative shows why the original causal arrow is not established by correlation alone."
    ],
    "explanation": [
      "An association describes how observations vary together; it does not by itself choose a causal direction.",
      "Rain could wet the paths and increase umbrella use.",
      "That shared-cause story can generate the observed association even if umbrellas have no meaningful effect on path wetness.",
      "It is a possible explanation to investigate, not a mechanism proved by mentioning it."
    ],
    "changes": "Multiple pathways can coexist. Measuring rainfall does not automatically control every relevant condition, and showing a possible shared cause does not prove the direct effect is zero.",
    "sources": [
      {
        "title": "Penn State STAT 200: Collecting data and study design",
        "url": "https://online.stat.psu.edu/stat200/Lesson01"
      },
      {
        "title": "OpenStax Introductory Statistics 2e: Sampling and variation",
        "url": "https://openstax.org/books/introductory-statistics-2e/pages/1-2-data-sampling-and-variation-in-data-and-sampling"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "Suppose the record also includes several dry indoor displays where many umbrellas are opened but no water is introduced. The floor stays dry. What does this add?",
      "conditions": [
        "The indoor umbrellas are dry; there are no other water sources in the display.",
        "Outdoor conditions may differ; the test is not a full reconstruction of every park day."
      ],
      "check": {
        "constant": "Opening many dry umbrellas indoors did not make the floor wet.",
        "forces": "Umbrella presence alone is not sufficient for wetness in this tested situation.",
        "equilibrium": "Consider what condition this intervention changed and which outdoor pathways it leaves untested."
      },
      "options": [
        {
          "id": "all-effects-zero",
          "text": "It proves umbrellas cannot ever contribute any water anywhere",
          "feedback": "Wet umbrellas could carry water; the dry display does not test every pathway."
        },
        {
          "id": "irrelevant",
          "text": "An intervention can never inform a causal claim",
          "feedback": "Changing a proposed cause can be informative when its prediction and scope are stated."
        },
        {
          "id": "bounded-test",
          "text": "It weakens the idea that umbrella presence alone necessarily wets a surface",
          "feedback": "The test addresses that particular claim without settling every outdoor mechanism."
        }
      ],
      "answer": "bounded-test",
      "hints": [
        "What form of the umbrella claim does the dry display actually test?",
        "“Not sufficient here” is narrower than “can never contribute.”"
      ],
      "explanation": [
        "The intervention shows that dry umbrella presence alone did not produce wetness in the display.",
        "It challenges an unconditional umbrella-causes-wetness claim, while leaving water carried on wet umbrellas and outdoor rainfall pathways open."
      ]
    },
    "reflectionPrompt": "How would you explain a shared cause without treating that explanation as already proven?"
  },
  {
    "id": "look-flashlight-swap",
    "kind": "look-twice",
    "daily": true,
    "title": "Follow the battery",
    "concept": "Testing explanations",
    "prompt": "Two otherwise identical flashlights use interchangeable batteries. A is dim and B is bright. Their battery charge states and lamp ages differ. Which available swap most directly helps distinguish a battery explanation from a lamp-body explanation?",
    "conditions": [
      "The question concerns these two flashlights, not every flashlight model.",
      "The batteries can be swapped while lamp bodies stay fixed. Contacts are seated consistently and settings remain unchanged.",
      "Brightness can be compared under the same viewing and measurement conditions."
    ],
    "check": {
      "constant": "A is dim and B is bright, but both battery and lamp body differ.",
      "forces": "The battery, lamp body, or a combination might influence brightness.",
      "equilibrium": "Let battery identity change independently of lamp-body identity."
    },
    "options": [
      {
        "id": "replace-both",
        "text": "Replace A’s battery and lamp body together",
        "feedback": "An improvement would still leave the two factors mixed."
      },
      {
        "id": "swap-batteries",
        "text": "Swap only the batteries between the two lamp bodies and compare both again",
        "feedback": "This creates a crossover: each lamp body is observed with each battery."
      },
      {
        "id": "watch-longer",
        "text": "Observe the original pair for longer without swapping anything",
        "feedback": "A stable difference can still be caused by either factor when they remain linked."
      }
    ],
    "answer": "swap-batteries",
    "hints": [
      "Which two differences currently travel together?",
      "Can the same battery be observed in each lamp body?",
      "Following what moves with the brightness helps locate a contributing factor, while interactions may still matter."
    ],
    "explanation": [
      "The initial comparison does not separate battery differences from lamp-body differences.",
      "Swapping only batteries lets each body be compared with both batteries.",
      "If brightness tracks the battery across bodies, that supports a battery-related contribution; if it tracks the body, that supports a body-related contribution.",
      "Results can also depend on the combination, so the swap need not identify one exclusive cause."
    ],
    "changes": "Changing contact quality, settings, temperature, or the comparison method during the swap would introduce alternatives. Recharge and discharge over time also need attention in repeated tests.",
    "sources": [
      {
        "title": "UC Berkeley Understanding Science: Testing scientific ideas",
        "url": "https://undsci.berkeley.edu/understanding-science-101/how-science-works/testing-scientific-ideas/"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Completely randomized designs",
        "url": "https://www.itl.nist.gov/div898/handbook/pri/section3/pri331.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "After the controlled swap, both lamp bodies are dim with battery X and bright with battery Y, and this repeats. What does that pattern support?",
      "conditions": [
        "Settings, contact seating, and measurement conditions are comparable across repeated swaps.",
        "Only these tested battery–body combinations are being considered."
      ],
      "check": {
        "constant": "The brightness pattern follows battery identity across both bodies.",
        "forces": "A property of the battery contributes more consistently than a difference fixed to one body.",
        "equilibrium": "Testing known charge levels or other battery properties would distinguish the battery mechanism further."
      },
      "options": [
        {
          "id": "battery-contribution",
          "text": "It supports a battery-related contribution, without identifying the exact battery property",
          "feedback": "The crossover localizes a contribution more narrowly than it identifies a specific mechanism."
        },
        {
          "id": "charge-proven",
          "text": "It establishes that battery X’s charge level is the exact mechanism",
          "feedback": "Battery identity includes other properties; the swap did not measure charge alone."
        },
        {
          "id": "body-only",
          "text": "It supports a cause fixed entirely to one lamp body",
          "feedback": "The same body changes brightness when battery identity changes."
        }
      ],
      "answer": "battery-contribution",
      "hints": [
        "Did the pattern follow the battery or the body?",
        "Identity is broader than one measured property such as charge."
      ],
      "explanation": [
        "The repeated crossover supports a contribution associated with battery identity.",
        "It does not by itself distinguish charge, internal resistance, or another battery property, and it need not establish that the body never matters."
      ]
    },
    "reflectionPrompt": "How would you explain what the swap can locate and what further mechanism it cannot yet identify?"
  },
  {
    "id": "look-consistent-ruler",
    "kind": "look-twice",
    "daily": true,
    "title": "Consistent is not calibrated",
    "concept": "Measurement",
    "prompt": "A new length gauge gives 10.0 cm every time on one test object. An older gauge gives values from 9.8 to 10.2 cm. Without a trusted reference length, what is established about the new gauge?",
    "conditions": [
      "Both gauges measure the same unchanged object under comparable conditions.",
      "The displayed values are genuine repeated measurements, with adequate resolution for this comparison.",
      "The object’s reference length and each gauge’s calibration are unknown."
    ],
    "check": {
      "constant": "The new gauge’s repeated readings vary less on this object.",
      "forces": "It may be closer to the reference, consistently offset from it, or both precise and accurate.",
      "equilibrium": "Measure a suitable trusted reference to investigate offset as well as repeatability."
    },
    "options": [
      {
        "id": "more-repeatable",
        "text": "It is more repeatable on this test, but greater accuracy is not yet established",
        "feedback": "This distinguishes consistency among readings from closeness to a trusted reference."
      },
      {
        "id": "more-accurate",
        "text": "It is necessarily closer to the true length",
        "feedback": "Low spread does not establish agreement with a reference value that has not been supplied."
      },
      {
        "id": "less-useful",
        "text": "It must be less useful because its readings never vary",
        "feedback": "Repeatability can be useful; the missing question is calibration, not whether consistency is always bad."
      }
    ],
    "answer": "more-repeatable",
    "hints": [
      "What do repeated readings tell you directly about spread?",
      "Could an instrument give the same wrong value every time?",
      "A reference comparison and repeated measurements answer different questions."
    ],
    "explanation": [
      "The new readings have less observed spread, so the new gauge is more repeatable in this test.",
      "Accuracy concerns agreement with an appropriate reference value, which has not been provided.",
      "A stable offset could make every new reading consistently wrong.",
      "A reference check can investigate that offset; repeated tests under broader conditions can assess whether the apparent repeatability persists."
    ],
    "changes": "Resolution limits can hide variability, and performance on one object or under one temperature does not describe every measuring situation. Reference uncertainty also matters.",
    "sources": [
      {
        "title": "NIST Engineering Statistics Handbook: Bias and accuracy",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section1/mpc113.htm"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Measurement variability",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section1/mpc114.htm"
      },
      {
        "title": "NIST Engineering Statistics Handbook: Calibration",
        "url": "https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc3.htm"
      }
    ],
    "diagram": null,
    "variation": {
      "kind": "look-twice",
      "prompt": "A reference artifact is now known to be 10.0 cm with negligible uncertainty for this exercise. On it, the new gauge repeatedly gives 10.3 cm, while the old gauge varies from 9.9 to 10.1 cm and averages 10.0 cm. Which comparison fits?",
      "conditions": [
        "Both gauges are tested repeatedly on this same artifact under comparable conditions.",
        "Compare repeatability and average offset from the stated reference."
      ],
      "check": {
        "constant": "The new readings are tightly clustered at 10.3; the old readings average the 10.0 reference with more spread.",
        "forces": "A consistent offset and random variation are different measurement properties.",
        "equilibrium": "Compare each instrument’s average to the reference and its spread across repetitions separately."
      },
      "options": [
        {
          "id": "new-both",
          "text": "The new gauge is both more repeatable and closer on average",
          "feedback": "Its average is 0.3 cm above the reference; the old average matches it in the supplied records."
        },
        {
          "id": "different-properties",
          "text": "The new gauge is more repeatable here; the old gauge has smaller average offset",
          "feedback": "The new gauge’s consistency coexists with a larger reference error."
        },
        {
          "id": "old-every-reading",
          "text": "Every old reading must be closer than every new reading in every future use",
          "feedback": "The supplied test does not guarantee every future reading or every other object and condition."
        }
      ],
      "answer": "different-properties",
      "hints": [
        "What is each instrument’s average difference from 10.0?",
        "Keep spread and average offset as separate comparisons."
      ],
      "explanation": [
        "In the supplied test, the new gauge has less spread but an average offset of +0.3 cm.",
        "The old gauge has more spread but no average offset in these records. The comparison illustrates why precision and calibration need separate checks."
      ]
    },
    "reflectionPrompt": "How would you explain the difference between a reading that repeats and a reading that agrees with a reference?"
  }
];
});
