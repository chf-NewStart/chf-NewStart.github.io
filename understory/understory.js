(() => {
    'use strict';

    const facts = Array.isArray(window.UNDERSTORY_FACTS) ? window.UNDERSTORY_FACTS : [];
    const grid = document.getElementById('factGrid');
    const ledgerShell = document.querySelector('.ledger-shell');
    const search = document.getElementById('factSearch');
    const clearSearch = document.getElementById('clearSearch');
    const resultCount = document.getElementById('resultCount');
    const savedCount = document.getElementById('savedCount');
    const specimenCount = document.getElementById('specimenCount');
    const emptyState = document.getElementById('emptyState');
    const filterButtons = [...document.querySelectorAll('[data-filter]')];
    const SAVED_KEY = 'understory.saved.v1';
    const SEEN_KEY = 'tomatoFunFactSeenCounts';

    const reflections = {
        'The biggest tree weighs more than a fleet of blue whales': {
            lens: 'scale / time',
            question: 'Does great age preserve an identity, or make room for thousands of different selves?'
        },
        'Lichens have survived open space': {
            lens: 'selfhood / cooperation',
            question: 'If survival belongs to a partnership, which participant is the survivor?'
        },
        'One of Earth’s largest organisms is a fungus': {
            lens: 'identity / scale',
            question: 'Must one body be visible—or even continuous—to count as one organism?'
        },
        'Mushrooms are closer kin to you than to plants': {
            lens: 'kinship',
            question: 'How much of “similarity” is something we see, rather than something history records?'
        },
        'Onions make you cry with a purpose-built gas': {
            lens: 'agency / defense',
            question: 'Can a defense be meaningfully described as a message when no sender intended it?'
        },
        'Fruit is a bribe': {
            lens: 'agency / purpose',
            question: 'Can something have a purpose without possessing an intention?'
        },
        'Chilies are spicy on purpose—but not for birds': {
            lens: 'selection / persuasion',
            question: 'When a fruit welcomes one animal and repels another, where does adaptation end and preference begin?'
        },
        'Avocados may be haunted by extinct giants': {
            lens: 'absence / memory',
            question: 'How long can a living form carry the absence of another species?'
        },
        'A fig is a flower turned inside out': {
            lens: 'intimacy / dependence',
            question: 'When two lives become necessary to one another, are they still separate stories?'
        },
        'Coconuts are ocean-going seed pods': {
            lens: 'chance / dispersal',
            question: 'How much of a life is design, and how much is simply being ready when a current carries you?'
        },
        'A banana plant is a giant herb, and every Cavendish is a clone': {
            lens: 'identity / vulnerability',
            question: 'What is gained—and what is endangered—when difference is traded for consistency?'
        },
        'One bad apple really does spoil the bunch': {
            lens: 'influence / decay',
            question: 'When change passes invisibly between bodies, where should responsibility for it live?'
        },
        'A 12-year-old invented vanilla farming': {
            lens: 'knowledge / recognition',
            question: 'How many ordinary luxuries rest on discoveries whose discoverers were denied ordinary power?'
        },
        'Orchid seeds are dust that needs a fungus': {
            lens: 'dependence / beginning',
            question: 'Was independence ever the natural starting condition of life?'
        },
        'A 2,000-year-old seed grew into a tree': {
            lens: 'time / potential',
            question: 'Was the seed alive for two thousand years—or was life waiting inside it?'
        },
        'Bamboo can grow almost a meter a day': {
            lens: 'time / rhythm',
            question: 'Should a life be measured by its duration, its pace, or the moment when it finally changes?'
        },
        'The oldest known tree predates the pyramids': {
            lens: 'time / witness',
            question: 'Does being present through history make a living thing a witness, even without memory?'
        },
        'A forest in Utah is one single tree': {
            lens: 'identity / multiplicity',
            question: 'If one life has forty-seven thousand bodies, what exactly does “individual” mean?'
        },
        'Venus flytraps can count': {
            lens: 'memory / behavior',
            question: 'How little memory is required before a response begins to look like a decision?'
        },
        'Grown-up sunflowers all face east': {
            lens: 'behavior / time',
            question: 'When does a chain of physical responses deserve to be called behavior?'
        },
        'Coffee plants drug their pollinators': {
            lens: 'persuasion / manipulation',
            question: 'Where is the boundary between attraction, persuasion, and manipulation?'
        },
        'Dragon fruit comes from a night-blooming cactus': {
            lens: 'timing / encounter',
            question: 'How much of connection depends not on compatibility, but on arriving in the same brief hour?'
        },
        'You can’t taste every apple in one lifetime of snacking': {
            lens: 'abundance / finitude',
            question: 'Does knowing that you cannot experience every variation diminish the world—or enlarge it?'
        },
        'The corpse flower fakes a crime scene': {
            lens: 'deception / meaning',
            question: 'Is deception defined by a deceiver’s intention, or by the false world experienced by its audience?'
        },
        'A tomato has more genes than you do': {
            lens: 'complexity / humility',
            question: 'Why are humans so eager to turn every biological number into a ranking?'
        },
        'A tomato is basically water with ambitions': {
            lens: 'matter / form',
            question: 'If almost all of a thing is ordinary matter, where does its particular character reside?'
        },
        'Sugar rides a pressure wave through the plant': {
            lens: 'flow / organism',
            question: 'Is an organism best understood as an object, or as a temporary pattern of moving material?'
        }
    };

    let activeFilter = 'curated';
    let query = '';
    let saved = loadSet(SAVED_KEY);
    const expanded = new Set();

    function loadSet(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return new Set(Array.isArray(value) ? value : []);
        } catch (_) {
            return new Set();
        }
    }

    function saveSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify([...value]));
        } catch (_) { /* Device storage can be unavailable in private mode. */ }
    }

    function loadSeen() {
        try {
            const value = JSON.parse(localStorage.getItem(SEEN_KEY));
            return value && typeof value === 'object' ? value : {};
        } catch (_) {
            return {};
        }
    }

    function recordSeen(fact) {
        const seen = loadSeen();
        seen[fact.title] = Math.min(9, (seen[fact.title] || 0) + 1);
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
        } catch (_) { /* Reading still works without device storage. */ }
    }

    function categoryFor(fact) {
        const tag = fact.tag.toUpperCase();
        if (tag.includes('RESEARCH')) return 'research';
        if (/EVOLUTION|HYPOTHESIS|ORIGINS|GENOMICS/.test(tag)) return 'evolution';
        if (/HISTORY|CULTURE|LANGUAGE|LAW/.test(tag)) return 'human';
        if (/BOTANY|BIOLOGY|BEHAVIOR|ANATOMY|DISPERSAL|RECORDS|SPACE/.test(tag)) return 'living';
        return 'food';
    }

    function slugify(text) {
        return text.toLowerCase()
            .normalize('NFKD')
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function matchesFilter(fact) {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'curated') return Boolean(reflections[fact.title]);
        if (activeFilter === 'saved') return saved.has(fact.title);
        return categoryFor(fact) === activeFilter;
    }

    function matchesQuery(fact) {
        if (!query) return true;
        const reflection = reflections[fact.title] || fallbackReflectionFor(fact);
        const haystack = [
            fact.tag,
            fact.title,
            fact.fact,
            fact.detail,
            fact.note,
            fact.source,
            reflection?.lens,
            reflection?.question
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
    }

    function evidenceFor(fact) {
        if (fact.tag.toUpperCase().includes('HYPOTHESIS')) {
            return { label: 'hypothesis · clearly marked', className: 'hypothesis' };
        }
        if (fact.source) return { label: 'source attached', className: 'sourced' };
        return { label: 'collection note', className: '' };
    }

    function fallbackReflectionFor(fact) {
        const prompts = {
            research: {
                lens: 'measurement / life',
                question: 'What becomes visible—and what disappears—when a living process is turned into numbers?'
            },
            evolution: {
                lens: 'history / form',
                question: 'What forgotten history had to happen for this living form to exist?'
            },
            human: {
                lens: 'nature / interpretation',
                question: 'Where does nature end and the human story about it begin?'
            },
            food: {
                lens: 'ordinary / strange',
                question: 'How much hidden machinery sits inside an ordinary appetite?'
            },
            living: {
                lens: 'life / definition',
                question: 'What does this ask us to reconsider about being alive?'
            }
        };
        return prompts[categoryFor(fact)];
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function makeRows(fact, index) {
        const reflection = reflections[fact.title] || fallbackReflectionFor(fact);
        const hasCuratedReflection = Boolean(reflections[fact.title]);
        const isSaved = saved.has(fact.title);
        const isOpen = expanded.has(fact.title);
        const seen = loadSeen();
        const evidence = evidenceFor(fact);
        const slug = slugify(fact.title);
        const fragment = document.createDocumentFragment();

        const row = element('tr', `fact-row${isSaved ? ' saved' : ''}${isOpen ? ' open' : ''}`);
        row.id = slug;
        row.dataset.index = String(index);

        const hookCell = element('td', `hook-cell${hasCuratedReflection ? '' : ' hook-derived'}`);
        hookCell.appendChild(element('p', 'hook-lens', reflection.lens));
        hookCell.appendChild(element('p', 'hook-question', reflection.question));
        row.appendChild(hookCell);

        const observationCell = element('td', 'observation-cell');
        observationCell.appendChild(element('p', 'fact-meta', `${String(index + 1).padStart(2, '0')} / ${fact.tag}`));
        observationCell.appendChild(element('h3', '', fact.title));
        observationCell.appendChild(element('p', 'fact-summary', fact.fact));
        row.appendChild(observationCell);

        const fieldCell = element('td', 'field-cell');
        const fieldStatus = element('div', 'field-status');
        fieldStatus.appendChild(element('span', `fact-state ${evidence.className}`, evidence.label));
        fieldStatus.appendChild(element('span', 'fact-read', seen[fact.title] ? 'read before' : 'unread'));
        fieldCell.appendChild(fieldStatus);

        const saveButton = element('button', 'save-button');
        saveButton.type = 'button';
        saveButton.dataset.saveTitle = fact.title;
        saveButton.setAttribute('aria-pressed', String(isSaved));
        saveButton.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Save'} “${fact.title}”`);
        const saveIcon = element('span', '', isSaved ? '★' : '☆');
        saveIcon.setAttribute('aria-hidden', 'true');
        saveButton.append(saveIcon, element('span', 'save-label', isSaved ? 'SAVED' : 'SAVE'));

        const openButton = element('button', 'row-open-button');
        openButton.type = 'button';
        openButton.dataset.openTitle = fact.title;
        openButton.setAttribute('aria-expanded', String(isOpen));
        openButton.setAttribute('aria-controls', `${slug}-detail`);
        openButton.setAttribute('aria-label', `${isOpen ? 'Close' : 'Open'} details for “${fact.title}”`);
        openButton.append(element('span', '', isOpen ? 'CLOSE' : 'OPEN'), element('span', 'fact-toggle', '+'));
        openButton.lastElementChild.setAttribute('aria-hidden', 'true');

        const fieldActions = element('div', 'field-actions');
        fieldActions.append(saveButton, openButton);
        fieldCell.appendChild(fieldActions);
        row.appendChild(fieldCell);
        fragment.appendChild(row);

        const detailRow = element('tr', 'fact-detail-row');
        detailRow.id = `${slug}-detail`;
        detailRow.hidden = !isOpen;
        const detailCell = element('td', 'fact-detail-cell');
        detailCell.colSpan = 3;
        const detail = element('div', 'fact-detail-panel');

        const detailMarker = element('div', 'detail-marker');
        detailMarker.append(element('span', '', `${String(index + 1).padStart(2, '0')} / FIELD NOTE`));
        detailMarker.append(element('span', '', hasCuratedReflection ? 'QUESTION ATTACHED' : 'OBSERVATION'));
        detail.appendChild(detailMarker);

        const detailCopy = element('div', 'detail-copy');
        detailCopy.appendChild(element('p', 'detail-label', 'MECHANISM / CONTEXT'));
        if (fact.quote) detailCopy.appendChild(element('blockquote', 'fact-quote', fact.quote));
        if (fact.detail) detailCopy.appendChild(element('p', 'fact-detail-copy', fact.detail));
        if (fact.note) detailCopy.appendChild(element('p', 'fact-project', `Why I care: ${fact.note}`));

        if (fact.source) {
            if (fact.url) {
                const source = element('a', 'source-link', `Source → ${fact.source}`);
                source.href = fact.url;
                source.target = '_blank';
                source.rel = 'noopener noreferrer';
                detailCopy.appendChild(source);
            } else {
                detailCopy.appendChild(element('span', 'source-label', `Source · ${fact.source}`));
            }
        }
        detail.appendChild(detailCopy);
        detailCell.appendChild(detail);
        detailRow.appendChild(detailCell);
        fragment.appendChild(detailRow);
        return fragment;
    }

    function filteredFacts() {
        return facts
            .map((fact, index) => ({ fact, index }))
            .filter(({ fact }) => matchesFilter(fact) && matchesQuery(fact));
    }

    function render() {
        const visible = filteredFacts();
        grid.replaceChildren(...visible.map(({ fact, index }) => makeRows(fact, index)));
        ledgerShell.hidden = visible.length === 0;
        emptyState.hidden = visible.length !== 0;
        resultCount.textContent = `Showing ${visible.length} of ${facts.length} notes`;
        savedCount.textContent = String(saved.size);
        specimenCount.textContent = `${facts.length} specimens · ${Object.keys(reflections).length} open questions`;
    }

    function updateFilterButtons() {
        filterButtons.forEach((button) => {
            const active = button.dataset.filter === activeFilter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function setFilter(filter) {
        activeFilter = filter;
        updateFilterButtons();
        render();
    }

    function setSearch(value) {
        query = value.trim().toLowerCase();
        clearSearch.hidden = !value;
        render();
    }

    function toggleFact(title, shouldOpen, { scroll = false, spotlight = false } = {}) {
        if (shouldOpen) {
            expanded.add(title);
            const fact = facts.find((entry) => entry.title === title);
            if (fact) recordSeen(fact);
        } else {
            expanded.delete(title);
        }
        render();
        const card = document.getElementById(slugify(title));
        if (!card) return;
        if (spotlight) {
            card.classList.remove('spotlight');
            requestAnimationFrame(() => card.classList.add('spotlight'));
        }
        if (scroll) {
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        }
        if (shouldOpen) history.replaceState(null, '', `#${card.id}`);
    }

    function openSpecific(title) {
        search.value = '';
        query = '';
        clearSearch.hidden = true;
        if (!reflections[title]) activeFilter = 'all';
        else activeFilter = 'curated';
        updateFilterButtons();
        render();
        toggleFact(title, true, { scroll: true, spotlight: true });
    }

    function surprise() {
        let pool = filteredFacts();
        if (!pool.length) {
            activeFilter = 'curated';
            query = '';
            search.value = '';
            clearSearch.hidden = true;
            updateFilterButtons();
            render();
            pool = filteredFacts();
        }
        const choice = pool[Math.floor(Math.random() * pool.length)];
        if (choice) toggleFact(choice.fact.title, true, { scroll: true, spotlight: true });
    }

    filterButtons.forEach((button) => {
        button.addEventListener('click', () => setFilter(button.dataset.filter));
    });

    document.querySelector('[data-filter-link="saved"]')?.addEventListener('click', () => {
        window.setTimeout(() => setFilter('saved'), 0);
    });

    search.addEventListener('input', () => setSearch(search.value));
    clearSearch.addEventListener('click', () => {
        search.value = '';
        setSearch('');
        search.focus();
    });

    document.getElementById('resetButton').addEventListener('click', () => {
        search.value = '';
        query = '';
        clearSearch.hidden = true;
        setFilter('all');
    });

    document.getElementById('surpriseButton').addEventListener('click', surprise);
    document.querySelector('.trailhead [data-open-title]').addEventListener('click', (event) => {
        openSpecific(event.currentTarget.dataset.openTitle);
    });

    grid.addEventListener('click', (event) => {
        const saveButton = event.target.closest('[data-save-title]');
        if (saveButton) {
            const title = saveButton.dataset.saveTitle;
            if (saved.has(title)) saved.delete(title);
            else saved.add(title);
            saveSet(SAVED_KEY, saved);
            render();
            document.querySelector(`[data-save-title="${CSS.escape(title)}"]`)?.focus();
            return;
        }

        const openButton = event.target.closest('[data-open-title]');
        if (!openButton) return;
        const title = openButton.dataset.openTitle;
        toggleFact(title, !expanded.has(title));
        document.querySelector(`[data-open-title="${CSS.escape(title)}"]`)?.focus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === '/' && document.activeElement !== search) {
            event.preventDefault();
            search.focus();
        }
        if (event.key === 'Escape' && document.activeElement === search && search.value) {
            search.value = '';
            setSearch('');
        }
    });

    render();

    if (location.hash) {
        const card = facts.find((fact) => `#${slugify(fact.title)}` === location.hash);
        if (card) window.setTimeout(() => openSpecific(card.title), 0);
    }
})();
