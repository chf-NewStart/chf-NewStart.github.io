// Live figure in the Research section: a greenhouse tomato whose leaves turn
// light into sugar and send it down the stem to the fruit, the source-to-sink
// traffic my PhD models. It is a hand-tuned illustration, not the research
// model. Each leaflet has a saturating light-response curve; upper leaves shade
// lower ones (rays marched through a leaf-area grid toward the sun); a share of
// the day's sugar is banked as starch and exported through the night; and each
// fruit pulls in proportion to how much growing it has left, discounted by how
// far the sugar has to travel.
//
// Drag sideways (or use the arrow keys) to move the sun, tap a ripe tomato to
// pick it. The loop only runs while the figure is on screen; a visitor who
// prefers reduced motion gets still frames that redraw on input.
(() => {
    'use strict';

    const fig = document.getElementById('plantFlux');
    if (!fig) return;
    const stage = fig.querySelector('.flux-stage');
    const canvas = fig.querySelector('.flux-canvas');
    const ctx = canvas && canvas.getContext('2d');
    if (!stage || !ctx) return;
    const spark = fig.querySelector('.flux-spark');
    const sctx = spark && spark.getContext('2d');
    const clockEl = fig.querySelector('.flux-clock');
    const lightEl = fig.querySelector('.flux-light');
    const pickedEl = fig.querySelector('.flux-picked');
    const hintEl = fig.querySelector('.flux-drag');

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = matchMedia('(pointer: coarse)');
    const TAU = Math.PI * 2;

    // ---- seeded randomness: every visit grows a slightly different plant ----
    let seed = (Math.random() * 4294967296) >>> 0;
    function rand() {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const between = (a, b) => a + (b - a) * rand();
    function gauss() {
        let u = 0;
        while (u === 0) u = rand();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
    }
    // Sizes come from a log-normal (median 1, heavy tail), never uniform(a, b).
    const lognormal = (sigma) => Math.exp(gauss() * sigma);
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
    const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

    // ---- the plant: a tree of nodes rooted at the foot of the stem ----------
    // Plant space has x to the right and y up, with the slab top at y = 0 and
    // the apex near 1. Sugar travels along parent links, so a route from any
    // leaflet to any fruit is the tree path through their common ancestor.
    const nxs = [], nys = [], parents = [], depths = [], groups = [], paces = [];
    function node(x, y, p, g, pace) {
        nxs.push(x); nys.push(y); parents.push(p);
        depths.push(p < 0 ? 0 : depths[p] + 1);
        groups.push(g); paces.push(pace);
        return nxs.length - 1;
    }

    const STEM_SEGS = 40;
    const stemTop = between(0.9, 0.96);
    const sp1 = between(0, TAU), sp2 = between(0, TAU);
    const sa1 = between(0.02, 0.038) * (rand() < 0.5 ? -1 : 1), sa2 = between(0.006, 0.012);
    const lean = between(-0.05, 0.05);
    const stemX = (t) => sa1 * (Math.sin(t * 2.3 + sp1) - Math.sin(sp1)) + sa2 * (Math.sin(t * 6.7 + sp2) - Math.sin(sp2)) + lean * t * t;
    const stem = [];
    for (let i = 0; i <= STEM_SEGS; i++) {
        const t = i / STEM_SEGS;
        stem.push(node(stemX(t), t * stemTop, i ? stem[i - 1] : -1, 0, 1.75));
    }
    const stemAt = (y) => stem[clamp(Math.round(y / stemTop * STEM_SEGS), 0, STEM_SEGS)];

    // Group 0 is the stem; every leaf and truss is its own group that swings
    // about the stem node it hangs from.
    const groupInfo = [{ pivot: stem[0], side: 0, phase: 0, amp: 0 }];

    // Leaflet outline in a local frame: u runs base to tip, v across, both in
    // units of the leaflet's length. Ovate, widest near the base, with a few
    // uneven teeth and sometimes a basal lobe, as tomato leaflets have.
    function leafletShape(widthRatio) {
        const N = 12;
        const asym = between(0.86, 1.14);
        const teeth = between(3.5, 7), toothPh = between(0, TAU), toothA = between(0.03, 0.09);
        const lobe = rand() < 0.45 ? between(0.1, 0.22) : 0, lobeU = between(0.15, 0.28);
        const bend = gauss() * 0.06;
        const width = (u) => widthRatio * (Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85)
            * (1 + toothA * Math.sin(u * teeth * TAU + toothPh) * u)
            + lobe * Math.exp(-(((u - lobeU) / 0.06) ** 2)));
        const mid = (u) => bend * Math.sin(Math.PI * u);
        const us = [], vs = [];
        for (let k = 0; k <= N; k++) { const u = k / N; us.push(u); vs.push(mid(u) + width(u) * asym); }
        for (let k = N - 1; k >= 1; k--) { const u = k / N; us.push(u); vs.push(mid(u) - width(u) / asym); }
        const veins = [0, 0, 0.5, mid(0.5), 0.5, mid(0.5), 0.95, mid(0.95)];
        const lats = [];
        const count = 3 + (rand() < 0.4 ? 1 : 0);
        for (let m = 0; m < count; m++) {
            const u0 = 0.14 + m * (0.66 / count) + rand() * 0.05, u1 = u0 + 0.13 + rand() * 0.06;
            lats.push(u0, mid(u0), u1, mid(u1) + 0.8 * width(u1) * asym);
            lats.push(u0, mid(u0), u1, mid(u1) - 0.8 * width(u1) / asym);
        }
        return { us: Float32Array.from(us), vs: Float32Array.from(vs), veins: Float32Array.from(veins.concat(lats)), lats: Float32Array.from(lats) };
    }

    const leaves = [];
    const leaflets = [];
    function addLeaflet(leaf, at, dirX, dirY, len, widthRatio) {
        const g = leaf.g;
        const base = node(nxs[at] + dirX * len * 0.08, nys[at] + dirY * len * 0.08, at, g, 0.6);
        const mid = node(nxs[at] + dirX * len * 0.5, nys[at] + dirY * len * 0.5, base, g, 0.6);
        const tip = node(nxs[at] + dirX * len, nys[at] + dirY * len, mid, g, 0.6);
        const shape = leafletShape(widthRatio);
        leaflets.push({
            leaf, base, mid, tip, len, shape,
            area: len * len * widthRatio * 1.3,
            exposure: between(0.8, 1), burstF: between(0.35, 1.25), burstP: between(0, TAU),
            T: 1, A: 0, il: 0, S: 0.1, glow: 0, acc: rand(), areaN: 1, cx: 0, cy: 0
        });
        leaf.leaflets.push(leaflets.length - 1);
    }
    // Unit direction of the rachis around node index i, rotated by angle a and
    // pulled a little toward the ground (leaflets droop).
    function leafletDir(rachis, i, a, droop) {
        const p = rachis[Math.max(0, i - 1)], q = rachis[Math.min(rachis.length - 1, i + 1)];
        let dx = nxs[q] - nxs[p], dy = nys[q] - nys[p];
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        const c = Math.cos(a), s = Math.sin(a);
        let x = dx * c - dy * s, y = dx * s + dy * c;
        y -= droop;
        const m = Math.hypot(x, y) || 1;
        return [x / m, y / m];
    }

    const nLeaves = 8 + (rand() < 0.45 ? 1 : 0);
    // Growers strip the oldest leaves below the ripening truss, so the lower
    // stem is bare. Internodes are log-normal, then squeezed to fit.
    const tLow = between(0.22, 0.28);
    const gaps = [];
    let gapSum = 0;
    for (let i = 0; i < nLeaves; i++) { const gp = lognormal(0.32); gaps.push(gp); gapSum += gp; }
    let tAcc = tLow;
    const phyllo0 = between(0, TAU);
    for (let i = 0; i < nLeaves; i++) {
        const t = tAcc;
        tAcc += gaps[i] / gapSum * (0.97 - tLow);
        // 137.5 degree phyllotaxis seen side-on: a leaf aimed at the viewer
        // looks short, one aimed away sits behind the stem.
        const phi = phyllo0 + i * 2.4 + gauss() * 0.18;
        const c = Math.cos(phi);
        const side = c >= 0 ? 1 : -1;
        const fx = 0.38 + 0.62 * Math.abs(c);
        const young = smooth(0.55, 1, t);
        const len = 0.47 * (1 - 0.72 * young) * lognormal(0.13);
        const th0 = side * between(0.55, 0.9) * (1 - 0.3 * young);
        const th1 = side * lerp(between(1.8, 2.25), between(1.0, 1.3), young);
        const g = groupInfo.length;
        const pivot = stemAt(t * stemTop);
        groupInfo.push({ pivot, side, phase: between(0, TAU), amp: between(0.6, 1.3) });
        const leaf = { g, side, front: Math.sin(phi) > -0.3, rachis: [pivot], width: lerp(1, 0.6, young), leaflets: [] };
        const K = 10, ds = len / K;
        let x = nxs[pivot], y = nys[pivot], prev = pivot;
        for (let s = 1; s <= K; s++) {
            const th = th0 + (th1 - th0) * Math.pow(s / K, 1.35);
            x += Math.sin(th) * ds * fx;
            y += Math.cos(th) * ds;
            prev = node(x, y, prev, g, 1);
            leaf.rachis.push(prev);
        }
        const pairs = len > 0.3 ? 4 : len > 0.17 ? 3 : 2;
        const wr = 0.36 * (0.6 + 0.4 * fx);
        for (let j = 0; j < pairs; j++) {
            const q = 0.3 + 0.6 * (j + rand() * 0.35) / pairs;
            const idx = clamp(Math.round(q * K), 1, K - 1);
            const size = len * 0.36 * (0.72 + 0.4 * j / Math.max(1, pairs - 1));
            const short = between(0.55, 0.92);
            const upFirst = rand() < 0.5;
            for (const sgn of [1, -1]) {
                const a = sgn * between(0.7, 1.15) * side;
                const d = leafletDir(leaf.rachis, idx, a, 0.12);
                const shrink = (sgn === 1) === upFirst ? 1 : short;
                addLeaflet(leaf, leaf.rachis[idx], d[0], d[1], size * shrink * lognormal(0.18), wr * lognormal(0.12));
            }
            // Small intercalary leaflets between the pairs, as on real tomato leaves.
            if (j < pairs - 1 && rand() < 0.55) {
                const idx2 = clamp(idx + 1, 1, K - 1);
                const d = leafletDir(leaf.rachis, idx2, (rand() < 0.5 ? 1 : -1) * between(0.9, 1.3), 0.1);
                addLeaflet(leaf, leaf.rachis[idx2], d[0], d[1], len * 0.1 * lognormal(0.3), wr * 0.9);
            }
        }
        const dT = leafletDir(leaf.rachis, K, gauss() * 0.12, 0.1);
        addLeaflet(leaf, leaf.rachis[K], dT[0], dT[1], len * 0.4 * lognormal(0.15), wr * lognormal(0.1));
        leaves.push(leaf);
    }

    // Trusses: the lowest hangs ripening below the stripped leaves, the middle
    // one is swelling, and the top one is still in flower.
    const FLOWER = 1, GROW = 2, RIPENING = 3, RIPE = 4, LEAVING = 5, BUD = 0;
    const trusses = [];
    const fruits = [];
    const trussT = [between(0.21, 0.26), between(0.43, 0.49), between(0.63, 0.69)];
    let trussSide = rand() < 0.5 ? 1 : -1;
    trussT.forEach((t, k) => {
        const g = groupInfo.length;
        const pivot = stemAt(t * stemTop);
        groupInfo.push({ pivot, side: trussSide, phase: between(0, TAU), amp: between(0.7, 1.2) });
        const len = between(0.16, 0.2) * (k === 2 ? 0.85 : 1) * (k === 0 ? 0.88 : 1);
        const a0 = trussSide * between(0.9, 1.2), a1 = trussSide * (k === 0 ? between(1.95, 2.3) : between(2.2, 2.6));
        const K = 7, ds = len / K;
        let x = nxs[pivot], y = nys[pivot], prev = pivot;
        const ped = [pivot];
        for (let s = 1; s <= K; s++) {
            const th = a0 + (a1 - a0) * Math.pow(s / K, 0.8);
            x += Math.sin(th) * ds;
            y += Math.cos(th) * ds;
            prev = node(x, y, prev, g, 1);
            ped.push(prev);
        }
        const nF = k === 0 ? 4 : k === 1 ? 4 + (rand() < 0.5 ? 1 : 0) : 5;
        for (let f = 0; f < nF; f++) {
            const idx = clamp(Math.round((0.3 + 0.7 * f / (nF - 1)) * K), 1, K);
            const at = ped[idx];
            const p = ped[idx - 1];
            let dx = nxs[at] - nxs[p], dy = nys[at] - nys[p];
            const l = Math.hypot(dx, dy) || 1;
            const alt = f % 2 ? 1 : -1;
            const pl = between(0.022, 0.034);
            const ex = nxs[at] + (-dy / l) * alt * pl, ey = nys[at] + (dx / l) * alt * pl - 0.012;
            const end = node(ex, ey, at, g, 0.9);
            const rMax = 0.044 * (1 - 0.14 * f / (nF - 1)) * lognormal(0.07) * (k === 2 ? 0.92 : 1);
            const centre = node(ex, ey - rMax * 0.95, end, g, 0.8);
            const sepals = [];
            for (let q = 0; q < 5; q++) sepals.push(-Math.PI / 2 + (q - 2) * 0.66 + gauss() * 0.12, 0.62 * lognormal(0.2), gauss() * 0.4);
            fruits.push({
                truss: k, end, centre, rMax, sepals,
                stage: FLOWER, m: 0, ripe: 0, age: 0, recv: 0, pulse: 0, wobble: 0, leave: 0, leaveKind: '',
                r: 0, cx: 0, cy: 0, fall: 0, glowPh: between(0, TAU)
            });
        }
        trusses.push({ g, ped, front: rand() < 0.65 });
        trussSide = -trussSide;
    });

    // Opening scene: the bottom truss is ripening (its first fruit is ripe and
    // waiting to be picked), the middle one is swelling, the top one flowering.
    function stageFruit() {
        const byTruss = [[], [], []];
        fruits.forEach((fr) => byTruss[fr.truss].push(fr));
        const ripen = [1, 0.62, 0.3, 0];
        byTruss[0].forEach((fr, i) => {
            fr.m = 1;
            fr.ripe = ripen[i] ?? 0;
            fr.stage = fr.ripe >= 1 ? RIPE : RIPENING;
        });
        byTruss[1].forEach((fr, i) => { fr.stage = GROW; fr.m = clamp(0.82 - i * 0.15, 0.12, 1); });
        byTruss[2].forEach((fr, i) => {
            if (i < 2) { fr.stage = GROW; fr.m = i ? 0.04 : 0.1; } else fr.stage = FLOWER;
        });
        fruits.forEach((fr) => { fr.age = 0; fr.recv = 0; fr.r = fruitTarget(fr); });
    }

    // Stem hairs (trichomes): log-normal lengths at irregular spacing.
    const hairs = [];
    for (let t = 0.01; t < 0.99; t += 0.0045 * lognormal(0.8)) {
        hairs.push(t, rand() < 0.5 ? -1 : 1, 0.0065 * lognormal(0.45), between(0.45, 1.1));
    }

    // ---- routes from every leaflet to every fruit -----------------------
    const N_NODES = nxs.length;
    const NX = Float32Array.from(nxs), NY = Float32Array.from(nys);
    const PACE = Float32Array.from(paces);
    function treePath(a, b) {
        const up = [], down = [];
        let x = a, y = b;
        while (depths[x] > depths[y]) { up.push(x); x = parents[x]; }
        while (depths[y] > depths[x]) { down.push(y); y = parents[y]; }
        while (x !== y) { up.push(x); x = parents[x]; down.push(y); y = parents[y]; }
        up.push(x);
        for (let i = down.length - 1; i >= 0; i--) up.push(down[i]);
        return up;
    }
    const routes = leaflets.map((L) => fruits.map((fr) => {
        const path = treePath(L.tip, fr.centre);
        const n = Int16Array.from(path);
        const c = new Float32Array(n.length);
        const p = new Float32Array(n.length);
        for (let i = 1; i < n.length; i++) {
            c[i] = c[i - 1] + Math.hypot(NX[n[i]] - NX[n[i - 1]], NY[n[i]] - NY[n[i - 1]]);
            p[i - 1] = Math.min(PACE[n[i]], PACE[n[i - 1]]) * 0.5 + Math.max(PACE[n[i]], PACE[n[i - 1]]) * 0.5;
        }
        return { n, c, p, len: c[n.length - 1] };
    }));
    // Nearer fruit get more of a leaflet's sugar.
    leaflets.forEach((L, i) => { L.near = routes[i].map((r) => Math.exp(-r.len / 0.75)); });
    const meanArea = leaflets.reduce((s, L) => s + L.area, 0) / leaflets.length;
    leaflets.forEach((L) => { L.areaN = L.area / meanArea; });

    // ---- canopy light: leaf area splatted into a grid, rays marched to the sun
    const GX = 44, GY = 36, G0X = -0.88, G0Y = -0.06, CELL = 0.04;
    const grid = new Float32Array(GX * GY);
    function splat(x, y, a) {
        const gx = (x - G0X) / CELL - 0.5, gy = (y - G0Y) / CELL - 0.5;
        const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
        const put = (ii, jj, w) => { if (ii >= 0 && jj >= 0 && ii < GX && jj < GY) grid[jj * GX + ii] += a * w; };
        put(i, j, (1 - fx) * (1 - fy)); put(i + 1, j, fx * (1 - fy)); put(i, j + 1, (1 - fx) * fy); put(i + 1, j + 1, fx * fy);
    }
    leaflets.forEach((L) => {
        for (const u of [0.3, 0.6, 0.9]) {
            splat(lerp(NX[L.base], NX[L.tip], u), lerp(NY[L.base], NY[L.tip], u), L.area / 3 / (CELL * CELL));
        }
        L.cx = lerp(NX[L.base], NX[L.tip], 0.5);
        L.cy = lerp(NY[L.base], NY[L.tip], 0.5);
    });
    function shadeSum(x0, y0, tx, ty) {
        let dx = tx - x0, dy = ty - y0;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        let x = x0 + dx * CELL * 1.3, y = y0 + dy * CELL * 1.3, sum = 0;
        for (let s = 0; s < 60; s++) {
            const i = Math.floor((x - G0X) / CELL), j = Math.floor((y - G0Y) / CELL);
            if (i < 0 || j < 0 || i >= GX || j >= GY) break;
            sum += grid[j * GX + i];
            x += dx * CELL; y += dy * CELL;
        }
        return sum;
    }
    // Calibrate the extinction coefficient per plant, so that with the sun
    // overhead the lower half of the canopy gets about 40% of full light.
    const KEXT = (() => {
        const sums = leaflets.map((L) => shadeSum(L.cx, L.cy, L.cx, 5)).sort((a, b) => a - b);
        const lowerMedian = sums[Math.floor(sums.length * 0.7)] || 1;
        return Math.log(1 / 0.4) / Math.max(lowerMedian, 0.5);
    })();

    // ---- simulation state -----------------------------------------------
    const KL = 0.32;            // light-response half-saturation, as a fraction of full sun
    const STARCH_IN = 0.16, STARCH_OUT = 0.36, NIGHT_E = 0.14;
    const FRUIT_SUGAR = 150;    // sugar to fill a full-size fruit
    const RIPEN_S = 16, RIPE_HOLD_S = 34;
    let tau = 7.0, tauTarget = 7.0;   // clock, in hours
    let simTime = 0, userUntil = -1, focused = false;
    let sunH = 0, light = 0, dayness = 0, twilight = 0;
    let picked = 0;
    let quality = 1;
    let particleCap = 560, emitTarget = 75;
    let EMIT = 1;
    const particles = [];
    const pops = [];
    const samples = new Float32Array(240);   // 120 x (light, sugar) at 2 Hz: the last minute
    let sampleCount = 0, sampleClock = 0, arrived = 0, sugarSmooth = 0;
    const sugarNorm = leaflets.reduce((s, L) => s + L.areaN, 0) * 0.74 * 0.5;

    function wrap24(h) { return ((h % 24) + 24) % 24; }
    function shortest(d) { d = wrap24(d); return d > 12 ? d - 24 : d; }

    // ---- layout ----------------------------------------------------------
    let W = 0, H = 0, dpr = 1, S = 1, baseX = 0, baseY = 0, slabH = 0, horizonY = 0, topY = 0;
    const SX = new Float32Array(N_NODES), SY = new Float32Array(N_NODES);
    const groupCos = new Float32Array(groupInfo.length), groupSin = new Float32Array(groupInfo.length);
    let sunX = 0, sunY = 0;

    // Background: clustered motes in the light shafts (a Neyman-Scott process,
    // not i.i.d. scatter) and a few clustered stars for the night.
    const motes = [];
    const stars = [];
    (function scatter() {
        const parentsN = 7;
        for (let p = 0; p < parentsN; p++) {
            const px = rand(), py = between(0.05, 0.85), spread = 0.07 * lognormal(0.5);
            const kids = 4 + Math.floor(rand() * 14);
            for (let k = 0; k < kids; k++) {
                motes.push({ x: px + gauss() * spread, y: py + gauss() * spread * 0.8, r: 0.75 * lognormal(0.5), ph: between(0, TAU), f: between(0.6, 2.2) });
            }
        }
        for (let p = 0; p < 5; p++) {
            const px = rand(), py = between(0.04, 0.55), spread = 0.1 * lognormal(0.4);
            const kids = 3 + Math.floor(rand() * 9);
            for (let k = 0; k < kids; k++) stars.push({ x: px + gauss() * spread, y: py + gauss() * spread * 0.6, r: 0.55 * lognormal(0.45), ph: between(0, TAU) });
        }
    })();
    // Light shafts fan out from the sun at irregular angles and widths.
    const rays = [];
    for (let k = 0; k < 6; k++) rays.push({ off: gauss() * 0.42, w: 0.07 * lognormal(0.5), a: clamp(0.06 * lognormal(0.5), 0.02, 0.12), ph: between(0, TAU), f: between(0.05, 0.16) });

    // Two dimmer plants further down the row, on wide screens only: the same
    // geometry, mirrored and smaller, drawn once per resize into a layer.
    let ghostLayer = null;
    function buildGhosts() {
        ghostLayer = null;
        if (W / H < 1.25) return;
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        const g = c.getContext('2d');
        if (!g) return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if ('filter' in g) g.filter = 'blur(1.4px)';
        g.lineCap = 'round';
        for (const [xFrac, mirror, scale] of [[0.13, -1, 0.64], [0.87, 1, 0.58]]) {
            const s = S * scale, ox = W * xFrac, oy = baseY - S * 0.03;
            const X = (i) => ox + mirror * NX[i] * s, Y = (i) => oy - NY[i] * s;
            g.strokeStyle = 'rgba(20,52,38,0.95)';
            g.lineWidth = Math.max(1, s * 0.014);
            g.beginPath();
            g.moveTo(X(stem[0]), Y(stem[0]));
            for (let i = 1; i <= STEM_SEGS; i++) g.lineTo(X(stem[i]), Y(stem[i]));
            g.stroke();
            g.lineWidth = Math.max(0.8, s * 0.004);
            for (const leaf of leaves) {
                g.beginPath();
                g.moveTo(X(leaf.rachis[0]), Y(leaf.rachis[0]));
                for (let i = 1; i < leaf.rachis.length; i++) g.lineTo(X(leaf.rachis[i]), Y(leaf.rachis[i]));
                g.stroke();
            }
            g.fillStyle = 'rgba(16,46,33,0.9)';
            for (const L of leaflets) {
                const bx = X(L.base), by = Y(L.base), dx = X(L.tip) - bx, dy = Y(L.tip) - by;
                const { us, vs } = L.shape;
                g.beginPath();
                for (let k = 0; k < us.length; k++) {
                    const x = bx + us[k] * dx - vs[k] * dy, y = by + us[k] * dy + vs[k] * dx;
                    if (k) g.lineTo(x, y); else g.moveTo(x, y);
                }
                g.fill();
            }
            for (const fr of fruits) {
                if (fr.truss === 2) continue;
                g.fillStyle = fr.truss === 0 ? 'rgba(112,44,32,0.7)' : 'rgba(40,84,48,0.75)';
                g.beginPath();
                g.arc(X(fr.centre), Y(fr.centre), fr.rMax * s * 0.95, 0, TAU);
                g.fill();
            }
        }
        ghostLayer = c;
    }

    function layout() {
        const r = stage.getBoundingClientRect();
        W = Math.max(1, Math.round(r.width));
        H = Math.max(1, Math.round(r.height));
        const maxDpr = quality > 0.8 ? 2 : quality > 0.5 ? 1.5 : 1;
        dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        slabH = Math.max(16, H * 0.06);
        baseY = H - slabH;
        baseX = W * 0.5;
        S = Math.min(H * 0.84, W * 1.12);
        horizonY = baseY;
        topY = H * 0.12;
        const small = W * H < 200000;
        particleCap = Math.round((small ? 520 : 760) * quality);
        emitTarget = (small ? 80 : 115) * quality;
        EMIT = emitTarget / (leaflets.length * 0.42);
        if (spark) {
            const sr = spark.getBoundingClientRect();
            spark.width = Math.max(1, Math.round(sr.width * dpr));
            spark.height = Math.max(1, Math.round(sr.height * dpr));
        }
        sparkDirty = true;
        buildGhosts();
        backdropKey = '';
    }

    function sunPosition(h) {
        const u = (h - 4.6) / 16.8;
        sunX = W * u;
        sunH = h > 4 && h < 22 ? Math.sin(Math.PI * (h - 6) / 14) : -1;
        sunY = horizonY - sunH * (horizonY - topY);
    }

    // ---- simulation --------------------------------------------------------
    function sinkStrength(fr) {
        switch (fr.stage) {
            case FLOWER: return 0.1;
            case GROW: return 0.22 + 1.15 * Math.pow(1 - fr.m, 1.4);
            case RIPENING: return 0.1;
            case RIPE: return 0.03;
            default: return 0;
        }
    }
    const weights = new Float32Array(fruits.length);
    function spawn(li, starch) {
        if (particles.length >= particleCap) return;
        const L = leaflets[li];
        let total = 0;
        for (let j = 0; j < fruits.length; j++) { weights[j] = sinkStrength(fruits[j]) * L.near[j]; total += weights[j]; }
        if (total <= 0) return;
        let pick = rand() * total, j = 0;
        while (j < fruits.length - 1 && pick > weights[j]) { pick -= weights[j]; j++; }
        const z = rand();
        const p = {
            r: routes[li][j], k: 0, f: rand() * 0.6, fruit: j, li, lat: -1, pre: 1, preLen: 1,
            v: 0.25 * lognormal(0.22), size: z < 0.62 ? 0 : z < 0.92 ? 1 : 2, starch
        };
        // Most sugar is loaded from the blade: it runs down a side vein into
        // the midrib before joining the route at that point.
        const lats = L.shape.lats;
        if (rand() < 0.8 && lats.length) {
            p.lat = Math.floor(rand() * (lats.length / 4)) * 4;
            p.pre = 0;
            p.preLen = Math.max(0.004, L.len * 0.92 * Math.hypot(lats[p.lat + 2] - lats[p.lat], lats[p.lat + 3] - lats[p.lat + 1]));
        }
        particles.push(p);
    }

    function arrive(p) {
        const fr = fruits[p.fruit];
        arrived += 1 / EMIT;
        fr.pulse = Math.min(1, fr.pulse + 0.16);
        if (fr.stage === GROW) {
            const size3 = (fr.rMax / 0.044) ** 3;
            fr.m = Math.min(1, fr.m + 1 / EMIT / (FRUIT_SUGAR * size3));
        } else if (fr.stage === FLOWER) {
            fr.recv++;
        }
    }

    function step(dt) {
        simTime += dt;
        // The clock runs on its own unless someone is steering the sun.
        if (simTime > userUntil && !focused && !(drag && drag.active)) {
            const dayRate = 14 / 40, nightRate = 10 / 14;
            const d = smooth(5.5, 6.5, tau) * (1 - smooth(19.5, 20.5, tau));
            tauTarget = wrap24(tauTarget + lerp(nightRate, dayRate, d) * dt);
        }
        tau = wrap24(tau + shortest(tauTarget - tau) * (1 - Math.exp(-dt / 0.14)));
        sunPosition(tau);
        light = sunH > 0 ? Math.pow(clamp(sunH * 1.04, 0, 1), 0.9) : 0;
        dayness = smooth(-0.1, 0.32, sunH);
        twilight = Math.exp(-((sunH / 0.16) ** 2)) * (sunX > -W * 0.1 && sunX < W * 1.1 ? 1 : 0);

        // Leaves: light through the canopy, a light-response curve, starch by
        // day and starch-fed export by night.
        const spx = (sunX - baseX) / S, spy = (baseY - sunY) / S;
        for (let i = 0; i < leaflets.length; i++) {
            const L = leaflets[i];
            if (light > 0) L.T = Math.exp(-KEXT * shadeSum(L.cx, L.cy, spx, spy));
            const il = light * L.T * L.exposure;
            const A = il > 0 ? il * (1 + KL) / (il + KL) : 0;
            L.A = A;
            L.il = il;
            const remob = L.S > 0.02 ? NIGHT_E * (1 - smooth(0, 0.25, A)) : 0;
            L.S = clamp(L.S + (0.26 * A * STARCH_IN - remob * STARCH_OUT) * dt, 0, 1);
            const eDay = 0.74 * A;
            L.glow += (il - L.glow) * (1 - Math.exp(-dt / 0.45));
            const s = 0.5 + 0.5 * Math.sin(simTime * L.burstF + L.burstP);
            const burst = 0.4 + 1.2 * s * s;
            L.acc += (eDay + remob) * L.areaN * EMIT * burst * dt;
            while (L.acc >= 1) {
                L.acc -= 1;
                spawn(i, rand() * (eDay + remob) < remob);
            }
        }

        // Sugar in the phloem.
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i], R = p.r, last = R.n.length - 1;
            let budget = p.v * dt, done = false;
            if (p.pre < 1) {
                p.pre += budget * 0.45 / p.preLen;
                if (p.pre < 1) continue;
                p.pre = 1;
                // Join the midrib where the vein meets it: the mid node sits at
                // u = 0.457 between the leaflet base (u = 0) and tip (u = 1).
                const u0 = leaflets[p.li].shape.lats[p.lat];
                if (u0 >= 0.457) { p.k = 0; p.f = (1 - u0) / 0.543; } else { p.k = 1; p.f = (0.457 - u0) / 0.457; }
                budget = 0;
            }
            while (budget > 0) {
                const seg = R.c[p.k + 1] - R.c[p.k];
                const pace = R.p[p.k];
                if (seg < 1e-6) { p.k++; p.f = 0; if (p.k >= last) { done = true; break; } continue; }
                const ahead = (1 - p.f) * seg;
                if (budget * pace < ahead) { p.f += budget * pace / seg; budget = 0; }
                else {
                    budget -= ahead / pace;
                    p.k++; p.f = 0;
                    if (p.k >= last) { done = true; break; }
                }
            }
            if (done) {
                arrive(p);
                particles[i] = particles[particles.length - 1];
                particles.pop();
            }
        }

        // Fruit: flowers set, fruit swell with the sugar they receive, then
        // ripen on a clock of their own and eventually drop if nobody picks them.
        for (const fr of fruits) {
            fr.pulse *= Math.exp(-dt * 2.6);
            fr.wobble *= Math.exp(-dt * 5);
            if (fr.stage === FLOWER) {
                fr.age += dt * (0.3 + light);
                if (fr.age > 5 && fr.recv >= 4) { fr.stage = GROW; fr.m = 0.025; fr.age = 0; }
            } else if (fr.stage === GROW) {
                if (fr.m >= 1) { fr.stage = RIPENING; fr.ripe = 0; }
            } else if (fr.stage === RIPENING) {
                fr.ripe += dt / RIPEN_S;
                if (fr.ripe >= 1) { fr.ripe = 1; fr.stage = RIPE; fr.age = 0; }
            } else if (fr.stage === RIPE) {
                fr.age += dt;
                if (fr.age > RIPE_HOLD_S) { fr.stage = LEAVING; fr.leaveKind = 'fall'; fr.leave = 0; fr.fall = 0; }
            } else if (fr.stage === LEAVING) {
                fr.leave += dt;
                if (fr.leaveKind === 'fall') fr.fall += dt;
                if (fr.leave > (fr.leaveKind === 'pick' ? 0.7 : 1.3)) { fr.stage = BUD; fr.age = 0; }
            } else if (fr.stage === BUD) {
                fr.age += dt;
                if (fr.age > 2.5) { fr.stage = FLOWER; fr.age = 0; fr.recv = 0; fr.m = 0; fr.ripe = 0; }
            }
        }
        for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 1.1) pops.splice(i, 1); }

        // The trace samples light and sugar delivered to the fruit at 2 Hz,
        // once the first sugar has had time to reach the fruit.
        sampleClock += dt;
        if (sampleClock >= 0.5 && simTime < 4) { sampleClock = 0; arrived = 0; }
        if (sampleClock >= 0.5) {
            const rate = arrived / sampleClock;
            arrived = 0; sampleClock = 0;
            sugarSmooth += (rate - sugarSmooth) * 0.5;
            samples.copyWithin(0, 2);
            samples[238] = light;
            samples[239] = clamp(sugarSmooth / sugarNorm, 0, 1.15);
            sampleCount = Math.min(120, sampleCount + 1);
            sparkDirty = true;
        }
    }

    // ---- drawing -----------------------------------------------------------
    function place() {
        const t = simTime;
        const wind = 0.6 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.83 + 1.3) + 0.1 * Math.sin(t * 1.9 + 0.4);
        const sway = (y) => wind * 0.012 * Math.pow(Math.max(0, y) / stemTop, 1.7);
        for (let g = 1; g < groupInfo.length; g++) {
            const gi = groupInfo[g];
            const a = gi.amp * (0.03 * Math.sin(t * 0.9 + gi.phase) + 0.018 * Math.sin(t * 2.1 + gi.phase * 1.7)) - wind * 0.025 * gi.side;
            groupCos[g] = Math.cos(a); groupSin[g] = Math.sin(a);
        }
        for (let i = 0; i < N_NODES; i++) {
            const g = groups[i];
            let x, y;
            if (g === 0) { x = NX[i] + sway(NY[i]); y = NY[i]; }
            else {
                const p = groupInfo[g].pivot;
                const px = NX[p] + sway(NY[p]), py = NY[p];
                const dx = NX[i] - NX[p], dy = NY[i] - NY[p];
                x = px + groupCos[g] * dx - groupSin[g] * dy;
                y = py + groupSin[g] * dx + groupCos[g] * dy;
            }
            SX[i] = baseX + x * S;
            SY[i] = baseY - y * S;
        }
    }

    const SKY_TOP_N = [3, 8, 7], SKY_TOP_D = [7, 22, 17], SKY_LOW_N = [5, 13, 11], SKY_LOW_D = [11, 30, 23];
    // The sky, the glasshouse, the plants down the row and the slab only change
    // with the daylight level, so they live in a layer redrawn when it shifts.
    let backdrop = null, backdropKey = '';
    function drawBackdrop() {
        const key = `${W}x${H}@${dpr}:${Math.round(dayness * 48)}`;
        if (key !== backdropKey || !backdrop) {
            backdropKey = key;
            if (!backdrop) backdrop = document.createElement('canvas');
            backdrop.width = canvas.width;
            backdrop.height = canvas.height;
            const b = backdrop.getContext('2d');
            const d = Math.round(dayness * 48) / 48;
            b.setTransform(dpr, 0, 0, dpr, 0, 0);
            const g = b.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, rgba(mix(SKY_TOP_N, SKY_TOP_D, d), 1));
            g.addColorStop(1, rgba(mix(SKY_LOW_N, SKY_LOW_D, d), 1));
            b.fillStyle = g;
            b.fillRect(0, 0, W, H);
            drawHouse(b);
            if (ghostLayer) {
                b.save();
                b.setTransform(1, 0, 0, 1, 0, 0);
                b.globalAlpha = 0.16 + 0.4 * d;
                b.drawImage(ghostLayer, 0, 0);
                b.restore();
            }
            drawSlab(b);
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(backdrop, 0, 0);
        ctx.restore();
    }

    function drawSky() {
        ctx.globalCompositeOperation = 'lighter';
        if (twilight > 0.01) {
            const tg = ctx.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, Math.max(W, H) * 0.75);
            tg.addColorStop(0, `rgba(255,150,80,${(0.2 * twilight).toFixed(3)})`);
            tg.addColorStop(0.4, `rgba(200,90,60,${(0.06 * twilight).toFixed(3)})`);
            tg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = tg;
            ctx.fillRect(0, 0, W, H);
        }
        const nightA = 1 - dayness;
        if (nightA > 0.02) {
            for (const s of stars) {
                const a = nightA * (0.35 + 0.35 * Math.sin(simTime * 1.3 + s.ph)) ;
                if (a < 0.02) continue;
                ctx.fillStyle = `rgba(215,255,235,${a.toFixed(3)})`;
                const r = s.r;
                ctx.fillRect(s.x * W - r, s.y * H - r, r * 2, r * 2);
            }
        }
        if (light > 0.003) {
            const R = Math.max(W, H) * 0.8;
            const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, R);
            const warm = 1 - smooth(0.1, 0.5, sunH);
            sg.addColorStop(0, `rgba(255,${(244 - 40 * warm) | 0},${(214 - 90 * warm) | 0},${(0.5 * light + 0.15 * twilight).toFixed(3)})`);
            sg.addColorStop(0.06, `rgba(255,224,170,${(0.22 * light).toFixed(3)})`);
            sg.addColorStop(0.28, `rgba(230,210,150,${(0.06 * light).toFixed(3)})`);
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg;
            const x0 = Math.max(0, sunX - R), y0 = Math.max(0, sunY - R);
            ctx.fillRect(x0, y0, Math.min(W, sunX + R) - x0, Math.min(H, sunY + R) - y0);
            // Shafts of light through the glass.
            const aim = Math.atan2(baseY - S * 0.45 - sunY, baseX - sunX);
            const reach = Math.hypot(W, H) * 1.3;
            for (const r of rays) {
                const a = aim + r.off + 0.05 * Math.sin(simTime * r.f + r.ph);
                const hw = r.w * (1 + 0.18 * Math.sin(simTime * r.f * 1.7 + r.ph * 2));
                const alpha = r.a * light * (0.75 + 0.25 * Math.sin(simTime * r.f * 2.3 + r.ph));
                const ex = sunX + Math.cos(a) * reach * 0.75, ey = sunY + Math.sin(a) * reach * 0.75;
                const lg = ctx.createLinearGradient(sunX, sunY, ex, ey);
                lg.addColorStop(0, `rgba(255,232,185,${alpha.toFixed(3)})`);
                lg.addColorStop(1, 'rgba(255,232,185,0)');
                ctx.fillStyle = lg;
                ctx.beginPath();
                ctx.moveTo(sunX, sunY);
                ctx.lineTo(sunX + Math.cos(a - hw) * reach, sunY + Math.sin(a - hw) * reach);
                ctx.lineTo(sunX + Math.cos(a + hw) * reach, sunY + Math.sin(a + hw) * reach);
                ctx.closePath();
                ctx.fill();
            }
            // The sun itself.
            const rs = Math.max(4.5, S * 0.016);
            const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, rs * 3.2);
            disc.addColorStop(0, `rgba(255,252,240,${(0.95 * Math.min(1, light * 3)).toFixed(3)})`);
            disc.addColorStop(0.3, `rgba(255,236,190,${(0.6 * Math.min(1, light * 3)).toFixed(3)})`);
            disc.addColorStop(1, 'rgba(255,220,160,0)');
            ctx.fillStyle = disc;
            ctx.fillRect(sunX - rs * 3.2, sunY - rs * 3.2, rs * 6.4, rs * 6.4);
        }
        // Dust in the shafts.
        if (light > 0.01) {
            const aim = Math.atan2(baseY - S * 0.45 - sunY, baseX - sunX);
            for (const m of motes) {
                m.x += (0.004 * Math.sin(m.y * 5 + simTime * 0.2 + m.ph)) * frameDt;
                m.y += (0.003 * Math.cos(m.x * 4 - simTime * 0.17) + 0.0015) * frameDt;
                if (m.y > 0.95) m.y -= 0.9;
                if (m.x < -0.05) m.x += 1.1; else if (m.x > 1.05) m.x -= 1.1;
                const x = m.x * W, y = m.y * H;
                const ang = Math.atan2(y - sunY, x - sunX);
                let beam = 0;
                for (const r of rays) {
                    const d = Math.atan2(Math.sin(ang - aim - r.off), Math.cos(ang - aim - r.off));
                    beam += r.a * 9 * Math.exp(-((d / (r.w * 1.2)) ** 2));
                }
                const a = light * (0.12 + beam) * (0.55 + 0.45 * Math.sin(simTime * m.f + m.ph));
                if (a < 0.02) continue;
                ctx.fillStyle = `rgba(255,240,205,${Math.min(0.8, a).toFixed(3)})`;
                ctx.fillRect(x - m.r * 0.5, y - m.r * 0.5, m.r, m.r);
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // A faint Venlo glasshouse: sawtooth roof, gutters and posts.
    function drawHouse(ctx) {
        const bays = W > 620 ? 4 : 2;
        const gutterY = H * 0.135, ridgeY = H * 0.035;
        ctx.strokeStyle = 'rgba(170,230,210,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let b = 0; b <= bays; b++) {
            const x = (b / bays) * W;
            if (b < bays) {
                const x2 = ((b + 1) / bays) * W, xm = (x + x2) / 2;
                ctx.moveTo(x, gutterY); ctx.lineTo(xm, ridgeY); ctx.lineTo(x2, gutterY);
                for (let m = 1; m < 4; m++) {
                    const q = m / 4;
                    ctx.moveTo(lerp(x, xm, q), lerp(gutterY, ridgeY, q)); ctx.lineTo(lerp(x, xm, q), gutterY);
                    ctx.moveTo(lerp(x2, xm, q), lerp(gutterY, ridgeY, q)); ctx.lineTo(lerp(x2, xm, q), gutterY);
                }
            }
        }
        ctx.moveTo(0, gutterY); ctx.lineTo(W, gutterY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(170,230,210,0.035)';
        ctx.beginPath();
        for (let b = 1; b < bays; b++) { const x = (b / bays) * W; ctx.moveTo(x, gutterY); ctx.lineTo(x, baseY); }
        ctx.stroke();
    }

    function drawSlab(ctx) {
        ctx.fillStyle = '#07120e';
        ctx.fillRect(0, baseY, W, H - baseY);
        ctx.fillStyle = 'rgba(118,247,165,0.16)';
        ctx.fillRect(0, baseY, W, 1);
        // The rockwool block the plant stands in.
        const bw = S * 0.1, bh = Math.min(slabH * 0.6, S * 0.035);
        ctx.fillStyle = '#10201a';
        ctx.fillRect(baseX - bw / 2, baseY - bh, bw, bh);
        ctx.fillStyle = 'rgba(118,247,165,0.12)';
        ctx.fillRect(baseX - bw / 2, baseY - bh, bw, 1);
    }

    const LEAF_DARK = [7, 22, 16], LEAF_LIT = [38, 124, 80], LEAF_STARCH = [140, 128, 52];
    function drawLeaves(front) {
        const lw = Math.max(0.9, S * 0.0045);
        for (const leaf of leaves) {
            if (leaf.front !== front) continue;
            const fade = front ? 1 : 0.62;
            ctx.strokeStyle = rgba(mix([18, 54, 36], [56, 150, 96], 0.25 + 0.5 * dayness), 0.9 * fade);
            ctx.lineWidth = lw * leaf.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const rc = leaf.rachis;
            ctx.moveTo(SX[rc[0]], SY[rc[0]]);
            for (let i = 1; i < rc.length; i++) ctx.lineTo(SX[rc[i]], SY[rc[i]]);
            ctx.stroke();
            for (const li of leaf.leaflets) {
                const L = leaflets[li];
                const bx = SX[L.base], by = SY[L.base], dx = SX[L.tip] - bx, dy = SY[L.tip] - by;
                const { us, vs, veins } = L.shape;
                const g = clamp(L.glow, 0, 1);
                let col = mix(LEAF_DARK, LEAF_LIT, Math.pow(g, 0.95));
                col = mix(col, LEAF_STARCH, L.S * 0.32);
                if (!front) col = mix(col, LEAF_DARK, 0.5);
                ctx.fillStyle = rgba(col, front ? 0.84 : 0.72);
                ctx.beginPath();
                for (let k = 0; k < us.length; k++) {
                    const x = bx + us[k] * dx - vs[k] * dy, y = by + us[k] * dy + vs[k] * dx;
                    if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.lineWidth = 0.8;
                ctx.strokeStyle = `rgba(130,250,180,${((0.09 + 0.45 * g) * fade).toFixed(3)})`;
                ctx.stroke();
                ctx.strokeStyle = `rgba(190,255,215,${((0.05 + 0.6 * g * g) * fade).toFixed(3)})`;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                for (let k = 0; k < veins.length; k += 4) {
                    ctx.moveTo(bx + veins[k] * dx - veins[k + 1] * dy, by + veins[k] * dy + veins[k + 1] * dx);
                    ctx.lineTo(bx + veins[k + 2] * dx - veins[k + 3] * dy, by + veins[k + 2] * dy + veins[k + 3] * dx);
                }
                ctx.stroke();
            }
        }
    }

    let flowLevel = 0;
    function drawStem() {
        const sunDx = sunX - baseX, sunDy = sunY - (baseY - S * 0.5);
        const sl = Math.hypot(sunDx, sunDy) || 1;
        const ux = sunDx / sl, uy = sunDy / sl;
        const widthAt = (t) => Math.max(1.4, S * 0.017 * (1 - 0.62 * t));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const chunk = 5;
        for (let c = 0; c < STEM_SEGS; c += chunk) {
            ctx.beginPath();
            ctx.moveTo(SX[stem[c]], SY[stem[c]]);
            for (let i = c + 1; i <= Math.min(STEM_SEGS, c + chunk); i++) ctx.lineTo(SX[stem[i]], SY[stem[i]]);
            ctx.lineWidth = widthAt((c + chunk / 2) / STEM_SEGS);
            ctx.strokeStyle = rgba(mix([14, 40, 28], [24, 74, 50], dayness), 1);
            ctx.stroke();
        }
        // Rim light on the sun side, then the phloem glowing with the flow.
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        for (let i = 0; i <= STEM_SEGS; i++) {
            const a = stem[Math.max(0, i - 1)], b = stem[Math.min(STEM_SEGS, i + 1)];
            let tx = SX[b] - SX[a], ty = SY[b] - SY[a];
            const tl = Math.hypot(tx, ty) || 1;
            let nx = -ty / tl, ny = tx / tl;
            if (nx * ux + ny * uy < 0) { nx = -nx; ny = -ny; }
            const off = widthAt(i / STEM_SEGS) * 0.32;
            const x = SX[stem[i]] + nx * off, y = SY[stem[i]] + ny * off;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.lineWidth = Math.max(0.8, S * 0.004);
        ctx.strokeStyle = `rgba(150,255,195,${(0.08 + 0.32 * light).toFixed(3)})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SX[stem[0]], SY[stem[0]]);
        for (let i = 1; i <= STEM_SEGS; i++) ctx.lineTo(SX[stem[i]], SY[stem[i]]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(118,247,165,${(0.06 + 0.3 * flowLevel).toFixed(3)})`;
        ctx.stroke();
        // Hairs catch the light on the sunny side.
        for (const lit of [true, false]) {
            ctx.beginPath();
            for (let h = 0; h < hairs.length; h += 4) {
                const t = hairs[h], side = hairs[h + 1], len = hairs[h + 2] * S, ang = hairs[h + 3];
                const fi = t * STEM_SEGS, i0 = Math.floor(fi), i1 = Math.min(STEM_SEGS, i0 + 1), f = fi - i0;
                const x = lerp(SX[stem[i0]], SX[stem[i1]], f), y = lerp(SY[stem[i0]], SY[stem[i1]], f);
                let tx = SX[stem[i1]] - SX[stem[i0]], ty = SY[stem[i1]] - SY[stem[i0]];
                const tl = Math.hypot(tx, ty) || 1;
                tx /= tl; ty /= tl;
                const nx = -ty * side, ny = tx * side;
                if ((nx * ux + ny * uy > 0) !== lit) continue;
                const w = widthAt(t) * 0.5;
                const hx = nx * Math.sin(ang) + tx * Math.cos(ang), hy = ny * Math.sin(ang) + ty * Math.cos(ang);
                ctx.moveTo(x + nx * w, y + ny * w);
                ctx.lineTo(x + nx * w + hx * len, y + ny * w + hy * len);
            }
            ctx.lineWidth = 0.7;
            ctx.strokeStyle = `rgba(205,255,225,${((lit ? 0.12 + 0.4 * light : 0.06 + 0.08 * light)).toFixed(3)})`;
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    function drawTrusses() {
        ctx.lineCap = 'round';
        const col = rgba(mix([18, 50, 34], [40, 112, 70], dayness), 1);
        for (const tr of trusses) {
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1, S * 0.0058);
            ctx.beginPath();
            ctx.moveTo(SX[tr.ped[0]], SY[tr.ped[0]]);
            for (let i = 1; i < tr.ped.length; i++) ctx.lineTo(SX[tr.ped[i]], SY[tr.ped[i]]);
            ctx.stroke();
        }
        ctx.lineWidth = Math.max(0.8, S * 0.0038);
        ctx.strokeStyle = col;
        ctx.beginPath();
        for (const fr of fruits) {
            if (fr.stage === BUD || (fr.stage === LEAVING)) continue;
            const end = fr.end, at = parents[end];
            ctx.moveTo(SX[at], SY[at]);
            ctx.lineTo(SX[end], SY[end]);
            if (fr.stage !== FLOWER) {
                ctx.moveTo(SX[end], SY[end]);
                ctx.lineTo(fr.cx, fr.cy - fr.r * 0.85);
            }
        }
        ctx.stroke();
    }

    function drawParticles() {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const trail = 0.028;
        const glowPaths = [new Path2D(), new Path2D()], corePaths = [[new Path2D(), new Path2D(), new Path2D()], [new Path2D(), new Path2D(), new Path2D()]];
        let flow = 0;
        for (const p of particles) {
            const kind = p.starch ? 1 : 0;
            if (p.pre < 1) {
                const L = leaflets[p.li], lt = L.shape.lats, q = p.lat;
                const bx = SX[L.base], by = SY[L.base], dx = SX[L.tip] - bx, dy = SY[L.tip] - by;
                const at = (t) => {
                    const u = lerp(lt[q + 2], lt[q], t), v = lerp(lt[q + 3], lt[q + 1], t);
                    return [bx + u * dx - v * dy, by + u * dy + v * dx];
                };
                const h = at(p.pre), t = at(Math.max(0, p.pre - trail * 0.7 / p.preLen));
                glowPaths[kind].moveTo(t[0], t[1]); glowPaths[kind].lineTo(h[0], h[1]);
                corePaths[kind][p.size].moveTo(lerp(t[0], h[0], 0.55), lerp(t[1], h[1], 0.55)); corePaths[kind][p.size].lineTo(h[0], h[1]);
                continue;
            }
            const R = p.r, n = R.n, c = R.c;
            const a = n[p.k], b = n[p.k + 1];
            const hx = lerp(SX[a], SX[b], p.f), hy = lerp(SY[a], SY[b], p.f);
            // Tail: walk back along the route by the trail length.
            let k = p.k, back = trail * (0.7 + 0.3 * p.size), f = p.f, tx = hx, ty = hy;
            while (k >= 0) {
                const seg = c[k + 1] - c[k];
                const have = f * seg;
                if (back <= have || k === 0) {
                    const f2 = seg > 0 ? Math.max(0, (have - back) / seg) : 0;
                    tx = lerp(SX[n[k]], SX[n[k + 1]], f2); ty = lerp(SY[n[k]], SY[n[k + 1]], f2);
                    break;
                }
                back -= have; k--; f = 1;
            }
            glowPaths[kind].moveTo(tx, ty); glowPaths[kind].lineTo(hx, hy);
            corePaths[kind][p.size].moveTo(lerp(tx, hx, 0.55), lerp(ty, hy, 0.55)); corePaths[kind][p.size].lineTo(hx, hy);
            if (groups[a] === 0) flow++;
        }
        flowLevel += (Math.min(1, flow / 90) - flowLevel) * 0.1;
        const hues = [[150, 255, 196], [255, 206, 112]];
        for (let kind = 0; kind < 2; kind++) {
            ctx.strokeStyle = rgba(hues[kind], 0.16);
            ctx.lineWidth = 2.6;
            ctx.stroke(glowPaths[kind]);
            for (let s = 0; s < 3; s++) {
                ctx.strokeStyle = rgba(hues[kind], [0.6, 0.8, 1][s]);
                ctx.lineWidth = [1.1, 1.6, 2.2][s];
                ctx.stroke(corePaths[kind][s]);
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    const RIPE_STOPS = [[0, [112, 172, 88]], [0.35, [214, 180, 70]], [0.65, [244, 124, 50]], [1, [250, 64, 44]]];
    function fruitColour(fr) {
        if (fr.stage === GROW || fr.stage === FLOWER || fr.stage === BUD) return mix([50, 116, 60], [112, 172, 88], fr.m);
        const r = fr.ripe;
        for (let i = 1; i < RIPE_STOPS.length; i++) {
            if (r <= RIPE_STOPS[i][0]) {
                const [a, ca] = RIPE_STOPS[i - 1], [b, cb] = RIPE_STOPS[i];
                return mix(ca, cb, (r - a) / (b - a));
            }
        }
        return RIPE_STOPS[3][1];
    }
    function fruitTarget(fr) {
        if (fr.stage === FLOWER || fr.stage === BUD) return 0;
        return fr.rMax * S * Math.cbrt(Math.max(0.02, fr.m));
    }

    // Fruit hang from their pedicels; settle sizes and positions before the
    // trusses are drawn, since the pedicels run to the fruit.
    function placeFruits() {
        for (const fr of fruits) {
            fr.r += (fruitTarget(fr) - fr.r) * Math.min(1, frameDt * 6);
            const ex = SX[fr.end], ey = SY[fr.end];
            const wob = fr.wobble * Math.sin(simTime * 40) * 0.12;
            fr.cx = ex + Math.sin(wob) * fr.r;
            fr.cy = ey + fr.r * 0.92;
            fr.alpha = 1; fr.scale = 1;
            if (fr.stage === LEAVING) {
                if (fr.leaveKind === 'pick') { const q = fr.leave / 0.7; fr.alpha = 1 - q; fr.scale = 1 + 0.3 * q; fr.cy -= 16 * q; }
                else { fr.cy += 450 * fr.fall * fr.fall; fr.alpha = 1 - fr.fall / 1.3; }
            }
        }
    }

    function drawFruits() {
        const lx0 = sunX - baseX, ly0 = sunY - (baseY - S * 0.4);
        const ll = Math.hypot(lx0, ly0) || 1;
        const lx = lx0 / ll, ly = ly0 / ll;
        const lit = 0.25 + 0.75 * dayness;
        for (const fr of fruits) {
            if (fr.stage === FLOWER) { drawFlower(SX[fr.end], SY[fr.end], fr); continue; }
            if (fr.stage === BUD) continue;
            const r = fr.r, cx = fr.cx, cy = fr.cy, alpha = fr.alpha, scale = fr.scale;
            if (alpha <= 0.01 || r < 0.5) continue;
            const rr = r * scale;
            const col = mix([18, 30, 22], fruitColour(fr), lit);
            ctx.globalAlpha = alpha;
            const hx = cx + lx * rr * 0.38, hy = cy + ly * rr * 0.38;
            const g = ctx.createRadialGradient(hx, hy, rr * 0.08, cx, cy, rr * 1.1);
            g.addColorStop(0, rgba(mix(col, [255, 250, 235], 0.42 * lit), 1));
            g.addColorStop(0.55, rgba(col, 1));
            g.addColorStop(1, rgba(mix(col, [8, 12, 10], 0.55), 1));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rr * 1.05, rr * 0.95, 0, 0, TAU);
            ctx.fill();
            if (light > 0.02) {
                ctx.fillStyle = `rgba(255,255,255,${(0.38 * light).toFixed(3)})`;
                ctx.beginPath();
                ctx.ellipse(cx + lx * rr * 0.48, cy + ly * rr * 0.48, rr * 0.17, rr * 0.1, Math.atan2(ly, lx) + Math.PI / 2, 0, TAU);
                ctx.fill();
            }
            // Calyx: five sepals curling out from the top.
            ctx.strokeStyle = rgba(mix([22, 60, 38], [52, 134, 80], lit), 1);
            ctx.lineWidth = Math.max(0.9, rr * 0.13);
            ctx.lineCap = 'round';
            ctx.beginPath();
            const topX = cx, topY = cy - rr * 0.88;
            for (let q = 0; q < 15; q += 3) {
                const a = fr.sepals[q], len = rr * fr.sepals[q + 1], curl = fr.sepals[q + 2];
                const ex2 = topX + Math.cos(a) * len, ey2 = topY + Math.sin(a) * len * 0.45 + len * 0.25;
                ctx.moveTo(topX, topY);
                ctx.quadraticCurveTo(topX + Math.cos(a + curl) * len * 0.6, topY + Math.sin(a + curl) * len * 0.3, ex2, ey2);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            // Glows: sugar arriving, and a slow pulse on fruit ready to pick.
            ctx.globalCompositeOperation = 'lighter';
            if (fr.pulse > 0.03) {
                const pg = ctx.createRadialGradient(cx, cy, rr * 0.6, cx, cy, rr * 1.7);
                pg.addColorStop(0, `rgba(140,255,190,${(0.22 * fr.pulse * alpha).toFixed(3)})`);
                pg.addColorStop(1, 'rgba(140,255,190,0)');
                ctx.fillStyle = pg;
                ctx.fillRect(cx - rr * 1.7, cy - rr * 1.7, rr * 3.4, rr * 3.4);
            }
            if (fr.stage === RIPE || (fr.stage === RIPENING && fr.ripe > 0.75)) {
                const k = 0.5 + 0.5 * Math.sin(simTime * 2.6 + fr.glowPh);
                const rg = ctx.createRadialGradient(cx, cy, rr * 0.9, cx, cy, rr * 2.3);
                rg.addColorStop(0, `rgba(255,96,64,${((0.1 + 0.14 * k) * alpha).toFixed(3)})`);
                rg.addColorStop(1, 'rgba(255,96,64,0)');
                ctx.fillStyle = rg;
                ctx.fillRect(cx - rr * 2.3, cy - rr * 2.3, rr * 4.6, rr * 4.6);
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        // "+1" floats up from a picked tomato.
        if (pops.length) {
            ctx.font = `600 ${Math.round(clamp(S * 0.04, 12, 16))}px "IBM Plex Mono", ui-monospace, monospace`;
            ctx.textAlign = 'center';
            for (const p of pops) {
                ctx.fillStyle = `rgba(255,140,110,${(1 - p.t / 1.1).toFixed(3)})`;
                ctx.fillText('+1', p.x, p.y - 26 * p.t);
            }
        }
    }

    function drawFlower(x, y, fr) {
        const s = Math.max(2.2, S * 0.012);
        const k = 0.45 + 0.55 * dayness;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y + s, 0, x, y + s, s * 3);
        g.addColorStop(0, `rgba(255,214,90,${(0.22 * k).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,214,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - s * 3, y - s * 2, s * 6, s * 6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(255,212,70,${(0.92 * k).toFixed(3)})`;
        for (let q = 0; q < 5; q++) {
            const a = fr.sepals[q * 3] + Math.PI / 2 + q * 0.2;
            ctx.beginPath();
            ctx.ellipse(x + Math.cos(a) * s * 0.75, y + s + Math.sin(a) * s * 0.75, s * 0.85, s * 0.28, a, 0, TAU);
            ctx.fill();
        }
        ctx.fillStyle = `rgba(226,170,40,${k.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y + s, s * 0.35, 0, TAU);
        ctx.fill();
    }

    let frameDt = 1 / 60;
    function render() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        place();
        drawBackdrop();
        drawSky();
        drawLeaves(false);
        drawStem();
        placeFruits();
        drawTrusses();
        drawLeaves(true);
        drawParticles();
        drawFruits();
        updateReadouts();
        if (sparkDirty) drawSpark();
    }

    // ---- the trace and the readouts -------------------------------------
    let sparkDirty = true;
    function drawSpark() {
        sparkDirty = false;
        if (!sctx) return;
        const w = spark.width, h = spark.height;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, w, h);
        const pad = 4 * dpr, top = 6 * dpr, n = 120;
        const x = (i) => (i / (n - 1)) * (w - pad * 2) + pad;
        const y = (v) => h - pad - v * (h - pad - top);
        sctx.strokeStyle = 'rgba(255,255,255,0.08)';
        sctx.lineWidth = 1;
        sctx.beginPath(); sctx.moveTo(pad, y(0) + 0.5); sctx.lineTo(w - pad, y(0) + 0.5); sctx.stroke();
        const first = n - sampleCount;
        if (sampleCount < 2) return;
        // Light: a filled gold band.
        sctx.beginPath();
        sctx.moveTo(x(first), y(0));
        for (let i = first; i < n; i++) sctx.lineTo(x(i), y(samples[i * 2]));
        sctx.lineTo(x(n - 1), y(0));
        sctx.closePath();
        sctx.fillStyle = 'rgba(232,196,106,0.1)';
        sctx.fill();
        sctx.beginPath();
        for (let i = first; i < n; i++) { const X = x(i), Y = y(samples[i * 2]); if (i === first) sctx.moveTo(X, Y); else sctx.lineTo(X, Y); }
        sctx.strokeStyle = 'rgba(232,196,106,0.6)';
        sctx.lineWidth = 1 * dpr;
        sctx.stroke();
        // Sugar reaching the fruit: it lags the light by the trip down the stem
        // and keeps going after dark on starch.
        sctx.beginPath();
        for (let i = first; i < n; i++) { const X = x(i), Y = y(samples[i * 2 + 1]); if (i === first) sctx.moveTo(X, Y); else sctx.lineTo(X, Y); }
        sctx.lineJoin = 'round';
        sctx.strokeStyle = 'rgba(118,247,165,0.22)';
        sctx.lineWidth = 4 * dpr;
        sctx.stroke();
        sctx.strokeStyle = 'rgba(140,255,190,0.95)';
        sctx.lineWidth = 1.6 * dpr;
        sctx.stroke();
        sctx.fillStyle = '#9dfbbf';
        sctx.beginPath(); sctx.arc(x(n - 1), y(samples[239]), 2.4 * dpr, 0, TAU); sctx.fill();
        sctx.fillStyle = '#e8c46a';
        sctx.beginPath(); sctx.arc(x(n - 1), y(samples[238]), 2 * dpr, 0, TAU); sctx.fill();
    }

    let shownClock = '', shownLight = '', ariaTick = -1;
    function clockText() {
        const mins = Math.floor(tau * 6) * 10;
        const hh = Math.floor(mins / 60) % 24, mm = mins % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    function updateReadouts() {
        const c = clockText();
        if (c !== shownClock) { shownClock = c; if (clockEl) clockEl.textContent = c; }
        const l = `${Math.round(light * 100)}%`;
        if (l !== shownLight) { shownLight = l; if (lightEl) lightEl.textContent = l; }
        const tick = Math.floor(simTime * 2);
        if (tick !== ariaTick) { ariaTick = tick; updateAria(); }
    }
    const COPY = {
        en: {
            label: 'Live figure: a tomato plant sending sugar from its leaves to its fruit. Left and right arrow keys move the sun; Enter picks a ripe tomato.',
            value: (c, l) => `${c}, light ${l}`
        },
        zh: {
            label: '实时图示：番茄植株把糖从叶片送往果实。左右方向键移动太阳，回车键摘下成熟的番茄。',
            value: (c, l) => `${c}，光照 ${l}`
        }
    };
    const lang = () => ((document.documentElement.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
    function updateAria() {
        const t = COPY[lang()];
        canvas.setAttribute('aria-label', t.label);
        canvas.setAttribute('aria-valuenow', tau.toFixed(1));
        canvas.setAttribute('aria-valuetext', t.value(clockText(), `${Math.round(light * 100)}%`));
    }
    new MutationObserver(updateAria).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    // ---- input -----------------------------------------------------------
    let drag = null;
    function localPoint(e) {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }
    function setSunFromX(x) {
        tauTarget = wrap24(4.6 + clamp(x / W, 0, 1) * 16.8);
        userUntil = simTime + 6;
        nudge();
    }
    function fruitAt(x, y) {
        let best = null, bestD = Infinity;
        for (const fr of fruits) {
            if (fr.stage !== GROW && fr.stage !== RIPENING && fr.stage !== RIPE) continue;
            const d = Math.hypot(x - fr.cx, y - fr.cy);
            if (d < fr.r + 12 && d < bestD) { best = fr; bestD = d; }
        }
        return best;
    }
    const pickable = (fr) => fr.stage === RIPE || (fr.stage === RIPENING && fr.ripe > 0.75);
    function pick(fr) {
        if (!pickable(fr)) { fr.wobble = 1; nudge(); return false; }
        fr.stage = LEAVING; fr.leaveKind = 'pick'; fr.leave = 0;
        picked++;
        if (pickedEl) pickedEl.textContent = String(picked);
        pops.push({ x: fr.cx, y: fr.cy - fr.r, t: 0 });
        nudge();
        return true;
    }
    function hintDone() { if (hintEl) hintEl.classList.add('is-done'); }

    canvas.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false };
    });
    canvas.addEventListener('pointermove', (e) => {
        const [x, y] = localPoint(e);
        if (drag && e.pointerId === drag.id) {
            const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
            if (!drag.active && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                drag.active = true;
                try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* already released */ }
                canvas.classList.add('is-dragging');
                hintDone();
            }
            if (drag.active) setSunFromX(x);
        } else if (e.pointerType === 'mouse') {
            const fr = fruitAt(x, y);
            canvas.classList.toggle('on-fruit', !!fr && pickable(fr));
        }
    });
    function endDrag(e, cancelled) {
        if (!drag || e.pointerId !== drag.id) return;
        const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
        if (!cancelled && !drag.active && moved < 10) {
            const [x, y] = localPoint(e);
            const fr = fruitAt(x, y);
            if (fr) pick(fr); else setSunFromX(x);
            hintDone();
        }
        if (drag.active) userUntil = simTime + 5;
        drag = null;
        canvas.classList.remove('is-dragging');
    }
    canvas.addEventListener('pointerup', (e) => endDrag(e, false));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
    canvas.addEventListener('focus', () => { focused = true; });
    canvas.addEventListener('blur', () => { focused = false; userUntil = simTime + 3; });
    canvas.addEventListener('keydown', (e) => {
        let d = 0;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -0.5;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = 0.5;
        else if (e.key === 'PageDown') d = -2;
        else if (e.key === 'PageUp') d = 2;
        else if (e.key === 'Home') { tauTarget = 6; d = 0; }
        else if (e.key === 'End') { tauTarget = 20; d = 0; }
        else if (e.key === 'Enter' || e.key === ' ') {
            const fr = fruits.find(pickable);
            if (fr) pick(fr);
            e.preventDefault();
            return;
        } else return;
        e.preventDefault();
        tauTarget = wrap24(tauTarget + d);
        userUntil = simTime + 6;
        hintDone();
        nudge();
    });

    // ---- loop, visibility, motion preference ----------------------------
    let built = false, visible = false, raf = 0, last = 0, workEma = 8, gapEma = 16, slowFor = 0;
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const elapsed = now - last;
        if (elapsed < 15) return;
        last = now;
        frameDt = Math.min(elapsed / 1000, 0.05);
        const t0 = performance.now();
        step(frameDt);
        render();
        // Step quality down if a slow device keeps missing its frames, whether
        // the time goes to script or to painting (seen as long frame gaps).
        workEma += (performance.now() - t0 - workEma) * 0.05;
        gapEma += (elapsed - gapEma) * 0.05;
        if ((workEma > 14 || gapEma > 26) && quality > 0.5) {
            slowFor += frameDt;
            if (slowFor > 2) { quality = quality > 0.8 ? 0.7 : 0.5; slowFor = 0; workEma = 8; gapEma = 16; layout(); }
        } else slowFor = 0;
    }
    function still() {
        // Reduced motion: no loop, but the scene still answers input.
        frameDt = 1 / 30;
        for (let i = 0; i < 24; i++) step(1 / 30);
        render();
    }
    let nudgeRaf = 0;
    function nudge() {
        if (raf || !built || !reduceMotion.matches || nudgeRaf) return;
        nudgeRaf = requestAnimationFrame(() => { nudgeRaf = 0; tau = tauTarget; still(); });
    }
    function sync() {
        const run = built && visible && !document.hidden && !reduceMotion.matches;
        if (run && !raf) { last = performance.now(); gapEma = 16; raf = requestAnimationFrame(frame); }
        else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
        if (built && reduceMotion.matches) still();
    }
    function build() {
        built = true;
        layout();
        // Run the morning in quietly, so sugar is already flowing when the
        // figure scrolls into view.
        // Run yesterday afternoon, the night and this morning in quietly, so the
        // trace already holds a night and sugar is flowing on first sight.
        tau = tauTarget = 15;
        leaflets.forEach((L) => { L.S = 0.45; });
        frameDt = 1 / 20;
        for (let i = 0; i < 1200 && !(tau > 9.2 && tau < 12); i++) step(1 / 20);
        stageFruit();
        render();
        updateAria();
    }

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
            if (!built) return;
            const r = stage.getBoundingClientRect();
            if (Math.round(r.width) === W && Math.round(r.height) === H) return;
            layout();
            sparkDirty = true;
            if (!raf) render();
        }).observe(stage);
    }
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            visible = entries[0].isIntersecting;
            if (visible && !built) build();
            sync();
        }, { rootMargin: '240px 0px' }).observe(fig);
    } else {
        visible = true;
        build();
        sync();
    }
    document.addEventListener('visibilitychange', sync);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', sync);
    if (coarse.addEventListener) coarse.addEventListener('change', () => { if (built) layout(); });
})();
