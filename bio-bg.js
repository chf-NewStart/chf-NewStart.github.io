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
    uniform float uTime;
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
        vec2 q = p * CELLS + drift;

        vec2 cellId, toCell;
        float border = voronoi(q, uTime * 0.18, cellId, toCell);

        float r0 = hash1(cellId);
        float r1 = hash1(cellId + 11.3);
        float r2 = hash1(cellId + 27.7);

        // Cytoplasmic streaming: spin the cell interior slowly, each cell with
        // its own direction and rate, so the granules circulate.
        vec2 local = -toCell;
        float spin = (r0 - 0.5) * 2.0;
        float ang = uTime * (0.14 + 0.22 * r1) * spin;
        float ca = cos(ang), sa = sin(ang);
        vec2 rl = mat2(ca, -sa, sa, ca) * local;

        vec2 gcoord = rl * 9.0 + cellId * 7.0;
        vec2 gid;
        float gd = granules(gcoord, gid);
        float gA = hash1(gid);
        float gB = hash1(gid + 5.1);

        // 0 at the wall, 1 deep inside the cell.
        float interior = smoothstep(0.0, 0.14, border);

        // Round granule mask with a soft edge; size varies a little.
        float gsize = 0.34 + 0.10 * gB;
        float gran = smoothstep(gsize, gsize - 0.09, gd);

        // Chloroplast palette: green -> lime -> gold, with a rare carotenoid
        // red/orange granule (the pigment family that makes a tomato red).
        vec3 green = vec3(0.16, 0.55, 0.14);
        vec3 lime  = vec3(0.42, 0.80, 0.22);
        vec3 gold  = vec3(0.62, 0.66, 0.12);
        vec3 chl = mix(green, lime, smoothstep(0.2, 0.9, gA));
        chl = mix(chl, gold, smoothstep(0.6, 1.0, gB) * 0.6);
        float red = step(0.94, gA);
        chl = mix(chl, vec3(0.86, 0.32, 0.10), red);

        // Fake spherical shading: bright toward each granule's centre.
        float shade = smoothstep(gsize, 0.0, gd);
        chl *= 0.55 + 0.75 * shade;

        // Dark green cytoplasm between the granules.
        vec3 cyto = mix(vec3(0.015, 0.035, 0.022), vec3(0.030, 0.080, 0.040), interior);

        vec3 col = cyto;
        col = mix(col, chl, gran * (0.35 + 0.65 * interior));

        // Cell wall: dark vein plus a thin iridescent rim, like the chromatic
        // fringing of a bright-field microscope.
        float wall = 1.0 - smoothstep(0.0, 0.045, border);
        float rim = smoothstep(0.020, 0.050, border) * (1.0 - smoothstep(0.050, 0.085, border));
        vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (border * 6.0 + r2) + vec3(0.0, 2.1, 4.2));
        col = mix(col, vec3(0.005, 0.010, 0.008), wall * 0.85);
        col += irid * rim * 0.18;

        // Faint volumetric green haze so the tissue reads as depth, not a decal.
        col += vec3(0.020, 0.060, 0.030) * fbm(p * 1.5 + drift * 2.0) * 0.5;

        // Dim and vignette so the field sits quietly behind page content.
        float vig = smoothstep(1.40, 0.20, length(p));
        col *= mix(0.28, 1.0, vig) * 0.62;

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

    let outW = 0;
    let outH = 0;

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
        gl.drawArrays(gl.TRIANGLES, 0, 3);
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
        draw((performance.now() - startTime) / 1000);
        markLive();
    }

    function start() {
        if (raf !== null || document.hidden) return;
        raf = window.requestAnimationFrame(frame);
    }

    function stop() {
        if (raf !== null) {
            window.cancelAnimationFrame(raf);
            raf = null;
        }
    }

    function renderStatic() {
        // A single developed frame for reduced-motion visitors.
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
