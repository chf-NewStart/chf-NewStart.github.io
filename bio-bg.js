// Live plant-tissue backdrop rendered on the GPU: a polygonal network of
// leaf cells (Voronoi), each packed with green-to-gold chloroplast granules
// that stream slowly around the cell interior (cytoplasmic streaming), with
// thin iridescent cell walls like a bright-field microscope. A rare red/orange
// granule stands in for the carotenoid pigments that turn a tomato red.
// Falls back to a static dark gradient (CSS) when WebGL2 is unavailable.
//
// This engine does NOT start itself. A mode manager owns the choice between
// backdrop engines and drives us through window.BIO_BG:
//     start()        lazily initialise, show the canvas, run the loop
//     stop()         cancel the loop and hide the canvas (a later start() works)
//     isSupported()  cheap capability probe, no permanent allocation
(() => {
    'use strict';

    const CANVAS_ID = 'bioBg';

    // --- hero legibility ------------------------------------------------
    // Body text in the hero sits directly on this backdrop, so a rounded,
    // softly feathered rectangle around it is dimmed by a measured gain.
    const SAFE_SELECTOR = '.hero-copy';
    const SAFE_PAD = 24;                  // CSS px grown around the element
    const SAFE_FALLBACK = [0, 0, 640, 420];
    const SAFE_TARGET_MEAN = 20;          // 0..255 relative luminance
    const SAFE_TARGET_P99 = 97;
    // Gentle, fixed dim behind the hero copy — enough to keep the text
    // comfortable, nowhere near enough to read as a dark patch.
    const SAFE_GAIN_FIXED = 0.86;
    const SAFE_GAIN_MIN = 0.25;
    const SAFE_GAIN_MAX = 1.0;
    const SAFE_PASSES = 3;                // set gain -> redraw -> re-measure
    // Calibration probes: developed frames at the WORST-CASE exposure, i.e.
    // uEnergy = 1, because scrolling lifts the shader's own exposure by ~1.36x.
    const SAFE_PROBES = [
        { seconds: 8.0, flow: 0.68 },
        { seconds: 23.5, flow: 1.31 },
    ];

    const MIN_FRAME_MS = 15;              // ~60Hz cap; motion is dt-based

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = `#version 300 es
    in vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

    // Single-pass procedural leaf tissue.
    const FRAG = `#version 300 es
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;   // wall-clock seconds (slow wobble, haze)
    uniform float uFlow;   // accumulated streaming phase (scroll speeds it up)
    uniform float uEnergy; // 0..1 stir intensity from recent scrolling
    uniform float uScroll; // page scroll offset in CSS px (parallax)
    uniform float uDir;    // smoothed scroll direction, -1..1
    uniform vec4 uSafe;    // hero text rect: x, y, w, h in CSS px, y from TOP
    uniform float uSafeGain; // brightness multiplier inside that rect
    uniform float uDpr;    // device px per CSS px
    out vec4 o;

    const float SAFE_FEATHER = 80.0;      // CSS px of smooth falloff

    float hash1(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash1(i);
        float b = hash1(i + vec2(1.0, 0.0));
        float c = hash1(i + vec2(0.0, 1.0));
        float d = hash1(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return s;
    }
    // Lighter 3-octave fbm for the pigment field (sampled twice per pixel).
    float fbm3(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.05; a *= 0.5; }
        return s;
    }

    // Nearest-granule distance (fine Voronoi F1) for the discrete particles.
    float granules(vec2 x, out vec2 id) {
        vec2 n = floor(x), f = fract(x);
        float md = 8.0;
        vec2 mid = n;
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 c = n + g;
                vec2 r = g + hash2(c + 31.4) - f;
                float d = dot(r, r);
                if (d < md) { md = d; mid = c; }
            }
        }
        id = mid;
        return sqrt(md);
    }

    // Cheap 2-octave scalar field used as a flow potential (stream function).
    float potential(vec2 x) {
        return vnoise(x) * 0.65 + vnoise(x * 2.1 + 11.0) * 0.35;
    }

    // Incompressible velocity = curl of the potential (its perpendicular
    // gradient). Divergence-free flow reads as a real fluid: it swirls and
    // shears without sources or sinks.
    vec2 flowVel(vec2 x) {
        float e = 0.06;
        float px = potential(x + vec2(e, 0.0)) - potential(x - vec2(e, 0.0));
        float py = potential(x + vec2(0.0, e)) - potential(x - vec2(0.0, e));
        return vec2(py, -px) / (2.0 * e);
    }

    // Cell contents = discrete chloroplast granules (round particles) floating
    // in a soft marbled liquid medium. Both are sampled at the advected flow
    // coordinate so the particles stream through the fluid. Returns pigment
    // colour in .rgb and coverage in .a; factored out so two time-offset layers
    // can be cross-faded for bounded flow.
    vec4 chloroplasts(vec2 gcoord) {
        // Soft flowing medium (domain-warped noise) that fills the cell.
        vec2 warp = vec2(fbm3(gcoord * 0.6 + 1.7), fbm3(gcoord * 0.6 + 9.2)) - 0.5;
        float med = fbm3(gcoord * 0.8 + warp * 2.2);
        med = clamp((med - 0.30) * 1.8, 0.0, 1.0);
        vec3 medCol = mix(vec3(0.08, 0.26, 0.09), vec3(0.28, 0.58, 0.17), smoothstep(0.2, 0.85, med));

        // Discrete granule particles (finer scale than the medium swirls).
        vec2 gid;
        float gd = granules(gcoord * 1.7 + 4.0, gid);
        float gA = hash1(gid);
        float gB = hash1(gid + 5.1);
        float gsize = 0.30 + 0.12 * gB;
        float pdot = smoothstep(gsize, gsize - 0.07, gd);       // round particle mask
        float shade = smoothstep(gsize, 0.0, gd);               // spherical highlight
        // green -> lime -> gold, with a rare carotenoid red/orange particle
        // (the pigment family that turns a tomato red).
        vec3 gCol = mix(vec3(0.18, 0.60, 0.15), vec3(0.50, 0.85, 0.24), smoothstep(0.2, 0.9, gA));
        gCol = mix(gCol, vec3(0.70, 0.74, 0.16), smoothstep(0.6, 1.0, gB) * 0.7);
        gCol = mix(gCol, vec3(0.92, 0.38, 0.10), step(0.93, gA));
        gCol *= 0.5 + 0.7 * shade;

        vec3 col = mix(medCol * 0.7, gCol, pdot);               // particles over medium
        float cov = clamp(med * 0.65 + pdot, 0.0, 1.0);
        return vec4(col, cov);
    }

    // Leaf-cell Voronoi. Returns distance to the cell wall; writes the cell id
    // and the vector from this pixel to the owning cell's centre.
    float voronoi(vec2 x, float t, out vec2 cellId, out vec2 toCell) {
        vec2 n = floor(x), f = fract(x);
        vec2 mg = vec2(0.0), mr = vec2(0.0);
        float md = 8.0;
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 ofs = 0.5 + 0.38 * sin(t + 6.2831853 * hash2(n + g));
                vec2 r = g + ofs - f;
                float d = dot(r, r);
                if (d < md) { md = d; mr = r; mg = g; }
            }
        }
        md = 8.0;
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = mg + vec2(float(i), float(j));
                vec2 ofs = 0.5 + 0.38 * sin(t + 6.2831853 * hash2(n + g));
                vec2 r = g + ofs - f;
                vec2 diff = mr - r;
                if (dot(diff, diff) > 0.00001) {
                    md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
                }
            }
        }
        cellId = n + mg;
        toCell = mr;
        return md;
    }

    // Brightness multiplier for the hero safe rectangle: uSafeGain inside,
    // 1.0 outside, with a rounded, C1-continuous falloff so no rectangular
    // seam is visible on screen.
    float safeFactor() {
        if (uSafe.z <= 0.0 || uSafe.w <= 0.0 || uSafeGain >= 0.999) return 1.0;
        // Fragment position in CSS px with the origin at the TOP-left corner.
        vec2 fragCss = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / max(uDpr, 0.001);
        vec2 hs = uSafe.zw * 0.5;            // 'half' is a reserved word in ESSL
        vec2 d = abs(fragCss - (uSafe.xy + hs)) - hs;
        // Euclidean distance to the rect: 0 inside, rounded at the corners.
        float outside = length(max(d, vec2(0.0)));
        return mix(uSafeGain, 1.0, smoothstep(0.0, SAFE_FEATHER, outside));
    }

    void main() {
        vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;

        const float CELLS = 2.6;
        vec2 drift = vec2(uTime * 0.020, uTime * 0.012);
        // Scrolling pans the tissue vertically (parallax).
        vec2 q = p * CELLS + drift + vec2(0.0, uScroll * 0.0011 * CELLS);

        vec2 cellId, toCell;
        float border = voronoi(q, 4.31 + uTime * 0.012, cellId, toCell);

        float r0 = hash1(cellId);
        float r1 = hash1(cellId + 11.3);
        float r2 = hash1(cellId + 27.7);

        // Cytoplasmic streaming. The pigment is carried by an incompressible
        // flow field (curl of noise) plus a per-cell circulation, so it swirls
        // along curving currents like real liquid cytoplasm. To keep the
        // advection from shearing the field over time, the flow is sampled as
        // two half-cycle-offset layers and cross-faded: each layer resets its
        // distortion to zero at the seam, hidden behind zero weight.
        vec2 local = -toCell;                    // cell centre -> pixel, ~[-1,1]
        float spin = (r0 - 0.5) * 2.0;           // per-cell direction + strength

        // Cytoplasmic streaming is myosin walking along aligned actin cables at
        // the cell cortex, so it runs as an organised rotational current with a
        // consistent per-cell direction — not as turbulence. Circulation leads;
        // the curl-noise stays only as a small irregularity on top of it.
        // Every cell is a differently shaped container, so its circulation
        // should be a differently shaped vortex. Rotate into a per-cell
        // principal axis and stretch the circulation along it: a stubby cell
        // swirls round, an elongated one recirculates as a long ellipse. This
        // costs one 2x2 rotation and two multiplies and adds NO noise samples,
        // so it does not move the frame budget.
        float th = r2 * 6.2831853;
        float ca = cos(th), sa = sin(th);
        float asp = 0.55 + 1.05 * r1;            // this cell's vortex aspect
        vec2 e = vec2(ca * local.x - sa * local.y, sa * local.x + ca * local.y);
        vec2 circ = vec2(-e.y * asp, e.x / asp);
        vec2 v = vec2(ca * circ.x + sa * circ.y, -sa * circ.x + ca * circ.y);
        v *= spin * (1.5 + 0.5 * r1);
        v += flowVel(local * 1.5 + cellId * 3.3) * 0.22;

        // Cytoplasm is a FLUID, not a turntable. Streaming runs in files along
        // actin cables, so bands across the cell travel at different rates and
        // shear past each other — that shear is most of what separates flowing
        // cytoplasm from a rotating texture. Safe to add now that the wall
        // lattice is anchored; while the walls were also sweeping, this smeared.
        float lane = vnoise(local * 3.4 + cellId * 5.7);
        // Organelles move saltatorily, jerking and pausing as they bind and
        // release myosin. Per-lane phase, so the cell never pulses as one body.
        float stutter = 0.82 + 0.26 * vnoise(vec2(uTime * 0.7 + lane * 9.3, lane * 4.1));
        v *= (0.70 + 0.60 * lane) * stutter;
        // Scrolling stirs each cell HARDER; it must not drag a current across the
        // tissue. The uniform translation that used to be here was the same at
        // every pixel regardless of which cell it fell in, so it swept pigment
        // straight through the walls and carried chloroplasts from one cell into
        // the next — which cannot happen, since the wall is what confines them.
        // Energy now amplifies the cell's own circulation, and scroll direction
        // only leans that circulation one way or the other.
        // Scroll reactivity, kept to a whisper. It used to multiply the flow by
        // up to 3.2x, the hop length by 1.9x and the exposure by 1.19x all at
        // once, so scrolling swung the total displacement nearly fourfold and
        // the field lurched into a different character mid-gesture. Measured
        // frame timing was untouched — 120fps and zero long frames either way —
        // so this was never jank; it was the picture itself becoming unstable.
        // Cytoplasm also does not stream faster because a human scrolled a page.
        v *= 1.0 + uEnergy * 0.30;
        v += vec2(-local.y, local.x) * uDir * uEnergy * 0.25;

        // No-slip: a real fluid has zero velocity where it meets a rigid wall.
        // Besides being the correct boundary condition, this is what guarantees
        // nothing can be advected across a cell boundary — the flow simply stops
        // before it gets there.
        // Flow lives in a BAND, not a ramp. No-slip holds at the wall surface,
        // but the cortical cytoplasm layer has thickness and streams
        // tangentially along the wall — and the middle of the cell is vacuole,
        // with no cytoplasm to flow at all. A monotonic ramp put peak flow in
        // the vacuole and zero flow exactly where the chloroplasts are packed
        // (cortex peaks at border 0.04, the ramp reached full only at 0.16), so
        // the visible pigment barely moved: correct anatomy and correct physics
        // cancelling each other out. This peaks the shear across the cortical
        // band where the granules actually sit.
        v *= smoothstep(0.0, 0.045, border) * (1.0 - smoothstep(0.20, 0.44, border));

        vec2 base = local * 5.6 + cellId * 7.0;  // larger, more liquid structures
        float AMP = 1.6 + uEnergy * 0.20;        // travel barely changes with scroll now
        float ph = uFlow;                        // phase advances faster when stirred
        float t0 = fract(ph);
        float t1 = fract(ph + 0.5);
        float w0 = sin(3.14159265 * t0);
        float w1 = sin(3.14159265 * t1);
        vec4 g0 = chloroplasts(base - v * (AMP * t0));
        vec4 g1 = chloroplasts(base - v * (AMP * t1));
        vec4 gcol = (g0 * w0 + g1 * w1) / max(1e-4, w0 + w1);

        // 0 at the wall, 1 deep inside the cell.
        float interior = smoothstep(0.0, 0.14, border);
        // A mature plant cell is mostly central vacuole: the cytoplasm is a
        // thin layer pressed against the wall, and that is where the
        // chloroplasts sit. Weight pigment toward the periphery — the middle
        // of a cell should be the emptiest part of it, not the fullest.
        float cortex = 1.0 - smoothstep(0.04, 0.30, border);

        // Vacuole in the centre, denser cytoplasm at the rim.
        vec3 cyto = mix(vec3(0.014, 0.030, 0.020), vec3(0.026, 0.062, 0.034), cortex);

        vec3 col = mix(cyto, gcol.rgb, gcol.a * (0.16 + 0.84 * cortex));

        // Cell wall: dark vein plus a thin iridescent rim, like the chromatic
        // fringing of a bright-field microscope.
        float wall = 1.0 - smoothstep(0.0, 0.045, border);
        float rim = smoothstep(0.020, 0.050, border) * (1.0 - smoothstep(0.050, 0.085, border));
        vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (border * 6.0 + r2) + vec3(0.0, 2.1, 4.2));
        col = mix(col, vec3(0.005, 0.010, 0.008), wall * 0.85);
        col += irid * rim * 0.18;

        // Faint volumetric green haze so the tissue reads as depth, not a decal.
        col += vec3(0.020, 0.060, 0.030) * fbm(p * 1.5 + drift * 2.0) * 0.5;

        // Dim and vignette so the field sits quietly behind page content;
        // scrolling lifts it a touch so the tissue visibly stirs awake.
        float vig = smoothstep(1.40, 0.20, length(p));
        col *= mix(0.46, 1.0, vig) * (1.45 + uEnergy * 0.05);

        // Guaranteed contrast where body text lands (measured, see calibrate()).
        col *= safeFactor();

        o = vec4(col, 1.0);
    }`;

    // ---------------------------------------------------------------- state
    let canvas = null;
    let gl = null;
    let prog = null;
    let vao = null;
    let buffer = null;
    let uRes, uTime, uFlow, uEnergy, uScroll, uDir, uSafe, uSafeGain, uDpr;

    let initTried = false;
    let initOk = false;
    let supportCache = null;

    let active = false;                      // the mode manager selected us
    let raf = null;
    let live = false;
    let lastDraw = 0;
    let refreshTimer = null;

    let dpr = 1;
    let outW = 0;
    let outH = 0;
    let sizedW = 0;                          // CSS size the last setup() used
    let sizedH = 0;

    // Streaming/scroll state.
    const BASE_FLOW = 0.30;                  // ~3.3s per cycle; 0.085 read as static
    // Envelope time constants in seconds. These replace per-frame smoothing
    // factors (0.45 attack / 0.045 release for energy, 0.3 / 0.05 for dir at
    // 60fps; tau = -T / ln(1 - k)), so the envelope keeps the same shape no
    // matter how often the loop runs. With per-frame factors, anything that
    // jittered the frame interval — the tomato rain sharing the main thread —
    // reshaped the envelope, and since energy also drives the shader's final
    // exposure, that read as the backdrop flickering.
    const ENERGY_ATTACK_TAU = 0.028;
    const ENERGY_RELEASE_TAU = 0.36;
    const DIR_ATTACK_TAU = 0.047;
    const DIR_RELEASE_TAU = 0.33;
    // Full stir at this scroll speed in CSS px/s (was 45 px/frame at 60fps).
    const ENERGY_FULL_VEL = 2700;
    const DIR_MIN_VEL = 30;                  // was 0.5 px/frame at 60fps
    // Frames longer than this are genuine stalls (tab switch, jank spike):
    // advance the flow by the cap instead of teleporting it. Ordinary heavy
    // frames below the cap advance in real time, so motion stays wall-clock
    // true under load instead of slowing down.
    const MAX_DT = 0.25;
    let flow = 0;                            // accumulated streaming phase
    let energy = 0;                          // 0..1 stir intensity
    let dir = 0;                             // smoothed scroll direction, -1..1
    let scrollY = window.scrollY || window.pageYOffset || 0;
    let prevScroll = scrollY;
    let lastT = performance.now();
    const startTime = performance.now();

    // Hero safe-rect state.
    let safeRect = SAFE_FALLBACK.slice();
    let safeGain = 1.0;
    let safeStats = { before: null, after: null };

    function el() {
        if (!canvas || !canvas.isConnected) {
            canvas = document.getElementById(CANVAS_ID);
        }
        return canvas;
    }

    // ------------------------------------------------------------ support
    // Cheap, side-effect-free probe: allocates a throwaway 1x1 context and
    // immediately drops it, so nothing is retained when we are not chosen.
    function isSupported() {
        if (initOk) return true;
        if (initTried && !initOk) return false;
        if (!el()) return false;
        if (supportCache !== null) return supportCache;
        let ok = false;
        try {
            if (typeof window.WebGL2RenderingContext === 'function') {
                const probe = document.createElement('canvas');
                probe.width = 1;
                probe.height = 1;
                const ctx = probe.getContext('webgl2', {
                    antialias: false, depth: false, stencil: false, alpha: false,
                });
                if (ctx) {
                    // The shader declares highp in the fragment stage.
                    const hp = ctx.getShaderPrecisionFormat(ctx.FRAGMENT_SHADER, ctx.HIGH_FLOAT);
                    ok = !!hp && hp.precision > 0;
                    const lose = ctx.getExtension('WEBGL_lose_context');
                    if (lose) lose.loseContext();
                }
            }
        } catch (err) {
            ok = false;
        }
        supportCache = ok;
        return ok;
    }

    // --------------------------------------------------------------- setup
    function compile(type, source) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
        }
        return sh;
    }

    function program(fragSource) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSource));
        gl.bindAttribLocation(p, 0, 'p');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
        }
        return p;
    }

    function fallback() {
        const c = el();
        if (c) {
            c.classList.add('bio-bg--fallback');
            c.removeAttribute('hidden');
        }
    }

    // Lazy: no GPU resources exist until the manager first starts us.
    function init() {
        if (initTried) return initOk;
        initTried = true;
        const c = el();
        if (!c) return false;

        gl = c.getContext('webgl2', {
            antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power',
        });
        if (!gl) {
            fallback();
            return false;
        }
        try {
            prog = program(FRAG);
        } catch (err) {
            gl = null;
            fallback();
            return false;
        }

        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.useProgram(prog);
        uRes = gl.getUniformLocation(prog, 'uRes');
        uTime = gl.getUniformLocation(prog, 'uTime');
        uFlow = gl.getUniformLocation(prog, 'uFlow');
        uEnergy = gl.getUniformLocation(prog, 'uEnergy');
        uScroll = gl.getUniformLocation(prog, 'uScroll');
        uDir = gl.getUniformLocation(prog, 'uDir');
        uSafe = gl.getUniformLocation(prog, 'uSafe');
        uSafeGain = gl.getUniformLocation(prog, 'uSafeGain');
        uDpr = gl.getUniformLocation(prog, 'uDpr');

        initOk = true;
        return true;
    }

    function setup() {
        const c = el();
        if (!c || !initOk) return;
        dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        // Measure the canvas, not the window: the stylesheet sizes it in lvh,
        // which does not equal innerHeight while the toolbars are showing.
        sizedW = c.clientWidth || window.innerWidth;
        sizedH = c.clientHeight || window.innerHeight;
        outW = Math.max(1, Math.round(sizedW * dpr));
        outH = Math.max(1, Math.round(sizedH * dpr));
        c.width = outW;
        c.height = outH;
        gl.viewport(0, 0, outW, outH);
    }

    // ---------------------------------------------------------------- draw
    function drawWith(seconds, flowV, energyV, scrollV, dirV, gainV) {
        if (!initOk) return;
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(uRes, outW, outH);
        gl.uniform1f(uTime, seconds);
        gl.uniform1f(uFlow, flowV);
        gl.uniform1f(uEnergy, energyV);
        gl.uniform1f(uScroll, scrollV);
        gl.uniform1f(uDir, dirV);
        gl.uniform4f(uSafe, safeRect[0], safeRect[1], safeRect[2], safeRect[3]);
        gl.uniform1f(uSafeGain, gainV);
        gl.uniform1f(uDpr, dpr);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function draw(seconds) {
        drawWith(seconds, flow, energy, scrollY, dir, safeGain);
    }

    // Fold recent scroll motion into the stir energy and streaming phase.
    // Sampled once per drawn frame so it is robust to irregular scroll events.
    function integrate(now) {
        const rawDt = (now - lastT) / 1000;
        lastT = now;
        const dt = Math.min(rawDt, MAX_DT);

        scrollY = window.scrollY || window.pageYOffset || 0;
        const rawVel = scrollY - prevScroll;
        prevScroll = scrollY;
        const vel = rawVel / Math.max(rawDt, 0.001);   // CSS px per second

        const target = Math.min(Math.abs(vel) / ENERGY_FULL_VEL, 1);
        // Fast attack, slow release: energy jumps on scroll, eases back to calm.
        const eTau = target > energy ? ENERGY_ATTACK_TAU : ENERGY_RELEASE_TAU;
        energy += (target - energy) * (1 - Math.exp(-dt / eTau));
        const dTarget = Math.abs(vel) > DIR_MIN_VEL ? Math.sign(vel) : 0;
        const dTau = dTarget !== 0 ? DIR_ATTACK_TAU : DIR_RELEASE_TAU;
        dir += (dTarget - dir) * (1 - Math.exp(-dt / dTau));

        flow += dt * (BASE_FLOW + energy * 0.55);
    }

    function markLive() {
        if (!live) {
            live = true;
            const c = el();
            if (c) c.classList.add('is-live');
        }
    }

    // Capped at ~60Hz: a 120Hz display would otherwise pay double the GPU cost
    // for identical motion. The rAF is rescheduled first and the skipped time
    // simply accumulates into the next dt, so flow advances by the same amount.
    function frame() {
        raf = window.requestAnimationFrame(frame);
        const now = performance.now();
        if (now - lastDraw < MIN_FRAME_MS) return;
        lastDraw = now;
        integrate(now);
        draw((now - startTime) / 1000);
        markLive();
    }

    function resume() {
        if (!active || raf !== null || !initOk) return;
        if (document.hidden || reduceMotion.matches) return;
        // Prime timers so a resume doesn't register a huge dt or a scroll jump.
        lastT = performance.now();
        lastDraw = 0;
        prevScroll = window.scrollY || window.pageYOffset || 0;
        raf = window.requestAnimationFrame(frame);
    }

    function pause() {
        if (raf !== null) {
            window.cancelAnimationFrame(raf);
            raf = null;
        }
    }

    function renderStatic() {
        // A single developed frame for reduced-motion visitors (no scroll stir).
        flow = 0.68;
        energy = 0;
        dir = 0;
        scrollY = window.scrollY || window.pageYOffset || 0;
        draw(8.0);
        markLive();
    }

    // ------------------------------------------------- hero-safe-rect logic
    function readSafeRect() {
        const c = el();
        const attr = c && c.getAttribute('data-safe-rect');
        if (attr) {
            const parts = attr.split(',').map((n) => parseFloat(n));
            if (parts.length === 4 && parts.every((n) => isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
                return parts;
            }
        }
        const target = document.querySelector(SAFE_SELECTOR);
        if (target) {
            const r = target.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                // Viewport position the copy occupies at the top of the page:
                // the rect lives in fixed viewport space, the copy does not.
                const sy = window.scrollY || window.pageYOffset || 0;
                const sx = window.scrollX || window.pageXOffset || 0;
                return [
                    r.left + sx - SAFE_PAD,
                    r.top + sy - SAFE_PAD,
                    r.width + SAFE_PAD * 2,
                    r.height + SAFE_PAD * 2,
                ];
            }
        }
        return SAFE_FALLBACK.slice();
    }

    // Mean and 99th-percentile relative luminance (0..255) of the safe region,
    // read back from the framebuffer. GPU stall: never call this per frame.
    function measureSafe() {
        if (!initOk || outW === 0) return null;
        const x0 = Math.max(0, Math.min(outW, Math.round(safeRect[0] * dpr)));
        const x1 = Math.max(0, Math.min(outW, Math.round((safeRect[0] + safeRect[2]) * dpr)));
        // readPixels has its origin at the BOTTOM-left; the rect's y is from the top.
        const yTop = Math.max(0, Math.min(outH, outH - Math.round(safeRect[1] * dpr)));
        const yBot = Math.max(0, Math.min(outH, outH - Math.round((safeRect[1] + safeRect[3]) * dpr)));
        const w = x1 - x0;
        const h = yTop - yBot;
        if (w <= 0 || h <= 0) return null;

        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(x0, yBot, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);

        // Sub-sample large regions: ~60k samples is plenty for a p99.
        const step = Math.max(1, Math.round(Math.sqrt((w * h) / 60000)));
        const hist = new Uint32Array(256);
        let sum = 0;
        let n = 0;
        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                const i = (y * w + x) * 4;
                const lum = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
                sum += lum;
                hist[lum < 255 ? (lum + 0.5) | 0 : 255] += 1;
                n += 1;
            }
        }
        if (!n) return null;
        const want = Math.ceil(n * 0.99);
        let acc = 0;
        let p99 = 255;
        for (let b = 0; b < 256; b++) {
            acc += hist[b];
            if (acc >= want) { p99 = b; break; }
        }
        return { mean: sum / n, p99, samples: n };
    }

    // Draw the worst-case (max-energy) probes at a candidate gain and return
    // the worst statistics across them.
    function probeAt(gain) {
        let worst = null;
        for (let i = 0; i < SAFE_PROBES.length; i++) {
            const pr = SAFE_PROBES[i];
            drawWith(pr.seconds, pr.flow, 1.0, scrollY, 0.0, gain);
            const s = measureSafe();
            if (!s) return null;
            if (!worst) worst = s;
            else worst = { mean: Math.max(worst.mean, s.mean), p99: Math.max(worst.p99, s.p99), samples: s.samples };
        }
        return worst;
    }

    // Measure, then solve for the gain that brings the hero region to
    // mean <= 20/255 and p99 <= 97/255. Once per size, off the hot path.
    function calibrate() {
        if (!initOk || outW === 0) return;
        safeRect = readSafeRect();

        // Measurement is disabled. It read pixels back from the DEFAULT
        // framebuffer, whose contents are undefined once the compositor has
        // swapped unless preserveDrawingBuffer is set — so on real GPUs the
        // numbers were garbage and the solver bottomed the gain out at 0.25,
        // dimming the whole hero region roughly fourfold. It only looked
        // right under software rendering, which is where it was tested.
        // A fixed, gentle dim needs no readback and cannot misfire.
        safeGain = SAFE_GAIN_FIXED;
        return;

        /* eslint-disable no-unreachable */
        const before = probeAt(1.0);
        if (!before) { safeGain = 1.0; return; }
        safeStats.before = before;

        let gain = 1.0;
        let stats = before;
        for (let pass = 0; pass < SAFE_PASSES; pass++) {
            if (stats.mean <= SAFE_TARGET_MEAN && stats.p99 <= SAFE_TARGET_P99) break;
            const need = Math.min(
                SAFE_TARGET_MEAN / Math.max(stats.mean, 0.001),
                SAFE_TARGET_P99 / Math.max(stats.p99, 0.001)
            );
            const next = Math.max(SAFE_GAIN_MIN, Math.min(SAFE_GAIN_MAX, gain * need));
            if (Math.abs(next - gain) < 0.002) { gain = next; break; }
            gain = next;
            const s = probeAt(gain);
            if (!s) break;
            stats = s;
        }
        safeGain = gain;
        safeStats.after = stats;
        // Leave the buffer holding the real state, not the last probe frame.
        draw((performance.now() - startTime) / 1000);
    }

    // ------------------------------------------------------------ lifecycle
    function applySize() {
        setup();
        calibrate();
    }

    function refresh() {
        // Re-measure once after layout settles (reveal animation, web fonts),
        // but only if the hero actually moved — calibration reads pixels back.
        if (!active || !initOk) return;
        const next = readSafeRect();
        let moved = false;
        for (let i = 0; i < 4; i++) if (Math.abs(next[i] - safeRect[i]) > 2) moved = true;
        if (!moved) return;
        calibrate();
        if (reduceMotion.matches) renderStatic();
    }

    function start() {
        const c = el();
        if (!c) return;
        active = true;
        c.removeAttribute('hidden');
        if (!init()) return;                 // fallback class already applied
        if (outW === 0 || sizedW !== (c.clientWidth || window.innerWidth)
            || sizedH !== (c.clientHeight || window.innerHeight)) {
            applySize();
        }
        if (reduceMotion.matches) {
            renderStatic();
        } else {
            resume();
        }
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refresh, 900);
    }

    function stop() {
        active = false;
        pause();
        window.clearTimeout(refreshTimer);
        const c = el();
        if (c) c.setAttribute('hidden', '');
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!active || !initOk) return;
            pause();
            applySize();
            if (reduceMotion.matches) renderStatic();
            else resume();
        }, 200);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause();
        else resume();
    });

    reduceMotion.addEventListener?.('change', () => {
        if (!active || !initOk) return;
        pause();
        applySize();
        if (reduceMotion.matches) renderStatic();
        else resume();
    });

    window.BIO_BG = {
        start,
        stop,
        isSupported,
        // Diagnostics for the hero-legibility calibration (not used at runtime).
        safeMetrics() {
            return {
                rect: safeRect.slice(),
                gain: safeGain,
                before: safeStats.before,
                after: safeStats.after,
            };
        },
    };
})();
