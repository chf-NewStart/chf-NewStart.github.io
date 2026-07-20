// Live reaction-diffusion backdrop (Gray-Scott model) rendered on the GPU.
// A perpetually-dividing cellular pattern that glows mint -> cyan out of
// near-black; the feed/kill parameters vary across the screen so coral,
// worms and mitosis regimes coexist. Falls back to a static dark gradient
// (CSS) when WebGL2 + float render targets are unavailable.
(() => {
    'use strict';

    const canvas = document.getElementById('bioBg');
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
        antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power',
    });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
        canvas.classList.add('bio-bg--fallback');
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const VERT = `#version 300 es
    in vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

    // Seed the field: A = 1 everywhere, B scattered as coarse specks.
    const SEED_FRAG = `#version 300 es
    precision highp float;
    uniform vec2 uRes;
    uniform float uSeed;
    out vec4 o;
    float hash(vec2 v) {
        return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
        vec2 cell = floor(gl_FragCoord.xy / 5.0);
        float b = hash(cell + uSeed) > 0.72 ? 1.0 : 0.0;
        o = vec4(1.0, b, 0.0, 1.0);
    }`;

    // One Gray-Scott step. Feed (f) and kill (k) vary with position so
    // several pattern regimes render simultaneously.
    const SIM_FRAG = `#version 300 es
    precision highp float;
    uniform sampler2D uState;
    uniform vec2 uTexel;
    uniform vec2 uRes;
    uniform float uTime;
    out vec4 o;
    void main() {
        vec2 uv = gl_FragCoord.xy * uTexel;
        vec2 s = texture(uState, uv).xy;
        vec2 lap = -s;
        lap += texture(uState, uv + vec2( uTexel.x, 0.0)).xy * 0.2;
        lap += texture(uState, uv + vec2(-uTexel.x, 0.0)).xy * 0.2;
        lap += texture(uState, uv + vec2(0.0,  uTexel.y)).xy * 0.2;
        lap += texture(uState, uv + vec2(0.0, -uTexel.y)).xy * 0.2;
        lap += texture(uState, uv + vec2( uTexel.x,  uTexel.y)).xy * 0.05;
        lap += texture(uState, uv + vec2(-uTexel.x,  uTexel.y)).xy * 0.05;
        lap += texture(uState, uv + vec2( uTexel.x, -uTexel.y)).xy * 0.05;
        lap += texture(uState, uv + vec2(-uTexel.x, -uTexel.y)).xy * 0.05;

        vec2 g = gl_FragCoord.xy / uRes;
        float f = mix(0.028, 0.040, g.y) + 0.0010 * sin(uTime * 0.06);
        float k = mix(0.0575, 0.0615, g.x) + 0.0008 * cos(uTime * 0.041);

        float a = s.x, b = s.y;
        float reab = a * b * b;
        a += (lap.x - reab + f * (1.0 - a));
        b += (lap.y * 0.5 + reab - (k + f) * b);
        o = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
    }`;

    // Map chemical B through a dark bio color ramp with a vignette.
    const RENDER_FRAG = `#version 300 es
    precision highp float;
    uniform sampler2D uState;
    uniform vec2 uRes;
    out vec4 o;
    void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        float b = texture(uState, uv).y;
        vec3 c0 = vec3(0.020, 0.063, 0.051);
        vec3 c1 = vec3(0.137, 0.780, 0.404);
        vec3 c2 = vec3(0.463, 0.969, 0.647);
        vec3 c3 = vec3(0.431, 0.839, 0.910);
        vec3 col = c0;
        col = mix(col, c1, smoothstep(0.04, 0.14, b));
        col = mix(col, c2, smoothstep(0.14, 0.28, b));
        col = mix(col, c3, smoothstep(0.28, 0.40, b));
        col *= mix(0.13, 0.42, smoothstep(0.16, 0.40, b));
        float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
        col *= mix(0.5, 1.0, vig);
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

    let seedProg;
    let simProg;
    let renderProg;
    try {
        seedProg = program(SEED_FRAG);
        simProg = program(SIM_FRAG);
        renderProg = program(RENDER_FRAG);
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

    const uniforms = (prog, names) => {
        const map = {};
        names.forEach((n) => { map[n] = gl.getUniformLocation(prog, n); });
        return map;
    };
    const seedU = uniforms(seedProg, ['uRes', 'uSeed']);
    const simU = uniforms(simProg, ['uState', 'uTexel', 'uRes', 'uTime']);
    const renderU = uniforms(renderProg, ['uState', 'uRes']);

    let simW = 0;
    let simH = 0;
    let outW = 0;
    let outH = 0;
    let targets = [];
    let read = 0;
    const STEPS_PER_FRAME = 14;

    function makeTarget(w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
    }

    function seed() {
        gl.useProgram(seedProg);
        gl.viewport(0, 0, simW, simH);
        gl.uniform2f(seedU.uRes, simW, simH);
        gl.uniform1f(seedU.uSeed, Math.floor(Math.random() * 1000));
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].fbo);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        read = 0;
    }

    function setup() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const cssW = window.innerWidth;
        const cssH = window.innerHeight;
        outW = Math.max(1, Math.round(cssW * dpr));
        outH = Math.max(1, Math.round(cssH * dpr));
        canvas.width = outW;
        canvas.height = outH;

        const simScale = Math.min(1, 620 / cssW);
        simW = Math.max(64, Math.round(cssW * simScale));
        simH = Math.max(64, Math.round(cssH * simScale));

        targets.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
        targets = [makeTarget(simW, simH), makeTarget(simW, simH)];
        seed();
    }

    function step(time) {
        gl.useProgram(simProg);
        gl.viewport(0, 0, simW, simH);
        gl.uniform2f(simU.uTexel, 1 / simW, 1 / simH);
        gl.uniform2f(simU.uRes, simW, simH);
        gl.uniform1f(simU.uTime, time);
        gl.uniform1i(simU.uState, 0);
        for (let i = 0; i < STEPS_PER_FRAME; i += 1) {
            const write = 1 - read;
            gl.bindFramebuffer(gl.FRAMEBUFFER, targets[write].fbo);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, targets[read].tex);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            read = write;
        }
    }

    function present() {
        gl.useProgram(renderProg);
        gl.viewport(0, 0, outW, outH);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.uniform2f(renderU.uRes, outW, outH);
        gl.uniform1i(renderU.uState, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets[read].tex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let raf = null;
    let live = false;
    const startTime = performance.now();
    // Pre-warm the field so the first painted frame is already a developed
    // pattern instead of growing out of black. Tunable for debugging.
    const WARMUP_STEPS = Math.max(0, Number(window.BIO_WARMUP) || 200);

    function warmUp() {
        for (let i = 0; i < WARMUP_STEPS; i += 1) step(i * 0.1);
    }

    function frame() {
        raf = window.requestAnimationFrame(frame);
        step((performance.now() - startTime) / 1000);
        present();
        if (!live) {
            live = true;
            canvas.classList.add('is-live');
        }
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

    function renderStaticEvolved() {
        // Warm the field up to a rich state, then present a single frame.
        warmUp();
        present();
        live = true;
        canvas.classList.add('is-live');
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            const wasRunning = raf !== null;
            stop();
            setup();
            if (reduceMotion.matches) renderStaticEvolved();
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
        if (reduceMotion.matches) renderStaticEvolved();
        else start();
    });

    setup();
    if (reduceMotion.matches) {
        renderStaticEvolved();
    } else {
        warmUp();
        start();
    }
})();
