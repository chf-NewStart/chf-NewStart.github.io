// Live plant-tissue backdrop rendered on the GPU: a polygonal network of
// leaf cells (Voronoi), each packed with green-to-gold chloroplast granules
// that stream slowly around the cell interior (cytoplasmic streaming), with
// thin iridescent cell walls like a bright-field microscope. A rare red/orange
// granule stands in for the carotenoid pigments that turn a tomato red.
// Falls back to a static dark gradient (CSS) when WebGL2 is unavailable.
(() => {
    'use strict';

    const canvas = document.getElementById('bioBg');
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
        antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power',
    });
    if (!gl) {
        canvas.classList.add('bio-bg--fallback');
        return;
    }

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
    out vec4 o;

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

    // Packed round granules (fine-scale Voronoi F1). Returns distance to the
    // nearest granule centre and writes that granule's cell id.
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

    // Colour + coverage of the chloroplast granules at a sampling coordinate.
    // Factored out so two time-offset layers can be sampled and cross-faded.
    vec4 chloroplasts(vec2 gcoord) {
        vec2 gid;
        float gd = granules(gcoord, gid);
        float gA = hash1(gid);
        float gB = hash1(gid + 5.1);
        float gsize = 0.34 + 0.10 * gB;
        float gran = smoothstep(gsize, gsize - 0.09, gd);
        // green -> lime -> gold, with a rare carotenoid red/orange granule
        // (the pigment family that turns a tomato red).
        vec3 chl = mix(vec3(0.16, 0.55, 0.14), vec3(0.42, 0.80, 0.22), smoothstep(0.2, 0.9, gA));
        chl = mix(chl, vec3(0.62, 0.66, 0.12), smoothstep(0.6, 1.0, gB) * 0.6);
        chl = mix(chl, vec3(0.86, 0.32, 0.10), step(0.94, gA));
        chl *= 0.55 + 0.75 * smoothstep(gsize, 0.0, gd); // fake spherical shading
        return vec4(chl, gran);
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

    void main() {
        vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;

        const float CELLS = 2.6;
        vec2 drift = vec2(uTime * 0.020, uTime * 0.012);
        // Scrolling pans the tissue vertically (parallax).
        vec2 q = p * CELLS + drift + vec2(0.0, uScroll * 0.0011 * CELLS);

        vec2 cellId, toCell;
        float border = voronoi(q, uTime * 0.18, cellId, toCell);

        float r0 = hash1(cellId);
        float r1 = hash1(cellId + 11.3);
        float r2 = hash1(cellId + 27.7);

        // Cytoplasmic streaming. The granules are carried by an incompressible
        // flow field (curl of noise) plus a per-cell circulation, so they glide
        // along curving currents like real cytoplasm. To keep the advection
        // from shearing the pattern into streaks over time, the flow is sampled
        // as two half-cycle-offset layers and cross-faded: each layer resets
        // its distortion to zero at the seam, hidden behind zero weight.
        vec2 local = -toCell;                    // cell centre -> pixel, ~[-1,1]
        float spin = (r0 - 0.5) * 2.0;           // per-cell direction + strength

        vec2 v = flowVel(local * 1.5 + cellId * 3.3);
        v += vec2(-local.y, local.x) * spin * (0.6 + 0.4 * r1); // circulation
        v += vec2(0.0, uDir) * uEnergy * 2.6;    // scrolling drags a current through

        vec2 base = local * 9.0 + cellId * 7.0;
        float AMP = 2.2 + uEnergy * 3.2;         // granules surge while scrolling
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

        // Dark green cytoplasm between the granules.
        vec3 cyto = mix(vec3(0.015, 0.035, 0.022), vec3(0.030, 0.080, 0.040), interior);

        vec3 col = mix(cyto, gcol.rgb, gcol.a * (0.35 + 0.65 * interior));

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
        col *= mix(0.28, 1.0, vig) * (0.62 + uEnergy * 0.22);

        o = vec4(col, 1.0);
    }`;

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
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSource));
        gl.bindAttribLocation(prog, 0, 'p');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
        }
        return prog;
    }

    let prog;
    try {
        prog = program(FRAG);
    } catch (err) {
        canvas.classList.add('bio-bg--fallback');
        return;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(prog);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uFlow = gl.getUniformLocation(prog, 'uFlow');
    const uEnergy = gl.getUniformLocation(prog, 'uEnergy');
    const uScroll = gl.getUniformLocation(prog, 'uScroll');
    const uDir = gl.getUniformLocation(prog, 'uDir');

    let outW = 0;
    let outH = 0;

    // Streaming/scroll state.
    const BASE_FLOW = 0.085;                 // resting phase rate (matches before)
    let flow = 0;                            // accumulated streaming phase
    let energy = 0;                          // 0..1 stir intensity
    let dir = 0;                             // smoothed scroll direction, -1..1
    let scrollY = window.scrollY || window.pageYOffset || 0;
    let prevScroll = scrollY;
    let lastT = performance.now();

    function setup() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        outW = Math.max(1, Math.round(window.innerWidth * dpr));
        outH = Math.max(1, Math.round(window.innerHeight * dpr));
        canvas.width = outW;
        canvas.height = outH;
        gl.viewport(0, 0, outW, outH);
    }

    function draw(seconds) {
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(uRes, outW, outH);
        gl.uniform1f(uTime, seconds);
        gl.uniform1f(uFlow, flow);
        gl.uniform1f(uEnergy, energy);
        gl.uniform1f(uScroll, scrollY);
        gl.uniform1f(uDir, dir);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Fold recent scroll motion into the stir energy and streaming phase.
    // Sampled once per frame so it is robust to irregular scroll events.
    function integrate(now) {
        let dt = (now - lastT) / 1000;
        lastT = now;
        if (dt > 0.05) dt = 0.05;            // clamp tab-switch / stall gaps

        scrollY = window.scrollY || window.pageYOffset || 0;
        const rawVel = scrollY - prevScroll;
        prevScroll = scrollY;

        const target = Math.min(Math.abs(rawVel) / 45, 1);
        // Fast attack, slow release: energy jumps on scroll, eases back to calm.
        energy += (target - energy) * (target > energy ? 0.45 : 0.045);
        if (Math.abs(rawVel) > 0.5) dir += (Math.sign(rawVel) - dir) * 0.3;
        else dir += (0 - dir) * 0.05;

        flow += dt * (BASE_FLOW + energy * 0.55);
    }

    let raf = null;
    let live = false;
    const startTime = performance.now();

    function markLive() {
        if (!live) {
            live = true;
            canvas.classList.add('is-live');
        }
    }

    function frame() {
        raf = window.requestAnimationFrame(frame);
        const now = performance.now();
        integrate(now);
        draw((now - startTime) / 1000);
        markLive();
    }

    function start() {
        if (raf !== null || document.hidden) return;
        // Prime timers so a resume doesn't register a huge dt or a scroll jump.
        lastT = performance.now();
        prevScroll = window.scrollY || window.pageYOffset || 0;
        raf = window.requestAnimationFrame(frame);
    }

    function stop() {
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

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            const wasRunning = raf !== null;
            stop();
            setup();
            if (reduceMotion.matches) renderStatic();
            else if (wasRunning || !live) start();
        }, 200);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (!reduceMotion.matches) start();
    });

    reduceMotion.addEventListener?.('change', () => {
        stop();
        setup();
        if (reduceMotion.matches) renderStatic();
        else start();
    });

    setup();
    if (reduceMotion.matches) {
        renderStatic();
    } else {
        start();
    }
})();
