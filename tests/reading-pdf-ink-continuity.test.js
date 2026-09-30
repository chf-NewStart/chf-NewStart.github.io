/* Geometry regression tests for the visible PDF pen outline. Synthetic events
   verify geometry/sampling, not real Apple Pencil latency or palm rejection.
   Run with PHLOEM_BROWSER=webkit as well as Chromium. */
let playwright;
try { playwright = require('playwright'); } catch (error) { playwright = require('playwright-core'); }
const path = require('path');
const browserName = process.env.PHLOEM_BROWSER || 'chromium';

(async () => {
  let browser;
  try {
    const launch = { headless: true };
    if (browserName === 'chromium' && process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
    browser = await playwright[browserName].launch(launch);
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>body{margin:0}.pdf-sheet{width:1000px;height:1000px;position:relative}.pdf-ink-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style><main id="pane"><div class="pdf-page" data-page="1"><div class="pdf-sheet"></div></div></main>');
    await page.addScriptTag({ path: process.env.PHLOEM_INK_SOURCE || path.resolve(__dirname, '../reading-ink.js') });
    if(process.env.PHLOEM_NATURAL_PREVIEW)await page.evaluate(()=>{location.hash='natural-preview';});
    const results = await page.evaluate(async () => {
      const results = [], sheet = document.querySelector('.pdf-sheet');
      const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
      const point = (x, y, pressure = .5) => [x / 1000, y / 1000, pressure];
      const line = (step, pressure) => {
        const points = [];
        for (let x = 100, i = 0; x <= 900; x += step, i++) points.push(point(x, 300, typeof pressure === 'function' ? pressure(i, x) : pressure));
        return points;
      };
      const render = (points, width = 5, style, shape) => {
        const stroke = { id: 'fixture', color: 'black', width, points, at: 1, updatedAt: 1 };
        if(style)stroke.style=style;if(shape)stroke.shape=shape;
        const before = JSON.stringify(stroke);
        PhloemInk.render(sheet, [stroke]);
        const nodes = Array.from(sheet.querySelectorAll('.pdf-ink-stroke'));
        const context = document.createElement('canvas').getContext('2d');
        const paths = nodes.map(node => new Path2D(node.getAttribute('d')));
        return { inside: (x, y) => paths.some(path => context.isPointInPath(path, x, y)), nodes,
          unchanged: JSON.stringify(stroke) === before };
      };
      // Measure the filled outline itself, independently of SVG path commands.
      // The 0.1-unit resolution is substantially finer than a visible device pixel.
      const widthAt = (ink, x, y = 300) => {
        let count = 0, runs = 0, previous = false;
        for (let offset = -18; offset <= 18; offset += .1) {
          const filled = ink.inside(x, y + offset);
          if (filled) count++;
          if (filled && !previous) runs++;
          previous = filled;
        }
        return { width: count * .1, runs };
      };
      const profile = (ink, from = 200, to = 800, step = 2) => {
        const widths = [];
        for (let x = from; x <= to; x += step) widths.push(widthAt(ink, x).width);
        const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
        return { min: Math.min(...widths), max: Math.max(...widths), mean,
          ripple: (Math.max(...widths) - Math.min(...widths)) / mean };
      };
      const detail = metrics => JSON.stringify(Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, +value.toFixed(3)])));

      for (const width of [1.5, 3, 5]) {
        const ink = render(line(4, i => i % 2 ? .85 : .15), width);
        const metrics = profile(ink);
        check('rapid pressure jitter does not bead the ' + width + '-width stroke', metrics.ripple < .2, detail(metrics));
        check('jittery ' + width + '-width ink has no centreline gaps', Array.from({ length: 801 }, (_, i) => i + 100).every(x => ink.inside(x, 300)));
        check('rendering leaves recorded pressure samples unchanged at width ' + width, ink.unchanged);
      }
      // The pressure still matters: smoothing must not make every pen monoline.
      const light = profile(render(line(4, .15))), heavy = profile(render(line(4, .85)));
      check('sustained heavier pressure remains visibly thicker', heavy.mean > light.mean * 1.15, 'light=' + light.mean.toFixed(3) + ', heavy=' + heavy.mean.toFixed(3));
      const ramp = render(line(4, (_, x) => .1 + .8 * (x - 100) / 800));
      const startWidth = profile(ramp, 180, 280), endWidth = profile(ramp, 720, 820);
      check('a gradual pressure ramp retains intentional line variation', endWidth.mean > startWidth.mean * 1.15, 'start=' + startWidth.mean.toFixed(3) + ', end=' + endWidth.mean.toFixed(3));
      check('a pressure ramp is a single filled band at every cross-section', Array.from({ length: 151 }, (_, i) => 200 + i * 4).every(x => widthAt(ramp, x).runs === 1));

      const dot = render([point(500, 500, .5)]);
      check('a stationary tap produces a filled dot', dot.inside(500, 500));
      check('dot outline is circular in all four directions', [0, Math.PI / 2, Math.PI, Math.PI * 1.5].every(angle => dot.inside(500 + Math.cos(angle) * 2, 500 + Math.sin(angle) * 2) && !dot.inside(500 + Math.cos(angle) * 12, 500 + Math.sin(angle) * 12)));
      const shortLine = render([point(200, 300), point(240, 300)]);
      check('two-point strokes have continuous interiors', Array.from({ length: 41 }, (_, i) => 200 + i).every(x => shortLine.inside(x, 300)));
      check('both short-stroke caps extend outward rather than notch inward', shortLine.inside(198, 300) && shortLine.inside(242, 300));
      check('both short-stroke caps are rounded', !shortLine.inside(196, 296) && !shortLine.inside(244, 296));

      const cornerPoints = [];
      for (let x = 200; x <= 500; x += 10) cornerPoints.push(point(x, 300));
      for (let y = 310; y <= 600; y += 10) cornerPoints.push(point(500, y));
      const corner = render(cornerPoints);
      check('a sharp turn stays joined without a pinhole', corner.inside(499, 301) && corner.inside(498, 300) && corner.inside(500, 302));
      check('a sharp turn does not produce an outward spike', !corner.inside(515, 285) && !corner.inside(512, 300));
      const sparse = render([point(100, 300), point(300, 300), point(500, 300), point(700, 300), point(900, 300)]);
      check('sparse samples join as one continuous stroke', Array.from({ length: 801 }, (_, i) => i + 100).every(x => sparse.inside(x, 300)));
      check('sparse constant-pressure samples have uniform thickness', profile(sparse).ripple < .08, detail(profile(sparse)));
      const reversedPoints = [];
      for (let x = 100; x <= 700; x += 10) reversedPoints.push(point(x, 300));
      for (let x = 690; x >= 100; x -= 10) reversedPoints.push(point(x, 300));
      const reversal = render(reversedPoints);
      check('backtracking over ink does not cancel its fill', Array.from({ length: 561 }, (_, i) => i + 120).every(x => reversal.inside(x, 300)));
      check('a complete direction reversal stays filled at the turning point', reversal.inside(699, 300));
      check('retraced ink retains a single solid width', widthAt(reversal, 400).runs === 1 && widthAt(reversal, 400).width > 6);
      const loopPoints = Array.from({ length: 129 }, (_, i) => {
        const angle = i * Math.PI / 64;
        return point(500 + 150 * Math.sin(angle), 500 + 100 * Math.sin(angle * 2));
      });
      const loop = render(loopPoints);
      check('figure-eight loop centreline remains filled through both lobes', loopPoints.every(p => loop.inside(p[0] * 1000, p[1] * 1000)));
      check('self-crossings do not punch a transparent hole in the ink', loop.inside(500, 500));
      const duplicates = render([point(200, 300), point(200, 300), point(240, 300), point(240, 300)]);
      check('duplicate imported coordinates cannot make invalid SVG geometry', duplicates.nodes.every(node => !/NaN|Infinity/.test(node.getAttribute('d'))));
      check('duplicate imported endpoints preserve a solid stroke', Array.from({ length: 39 }, (_, i) => 201 + i).every(x => duplicates.inside(x, 300)));
      const densePoints = Array.from({ length: 4096 }, (_, i) => point(100 + 800 * i / 4095, 300, i % 2 ? .85 : .15));
      const dense = render(densePoints);
      const densePath = dense.nodes.map(node => node.getAttribute('d')).join(' ');
      const capsuleCount = (densePath.match(/[mM]/g) || []).length;
      check('a 4096-sample straight stroke has bounded display geometry', capsuleCount <= 96 && densePath.length < 20000, 'capsules=' + capsuleCount + ', path bytes=' + densePath.length);
      check('dense display simplification preserves all original samples', dense.unchanged && densePoints.length === 4096);
      check('dense display geometry contains only finite coordinates', densePath.length > 0 && !/NaN|Infinity|undefined/.test(densePath));
      check('dense simplified ink remains solid without pressure beading', profile(dense).ripple < .2 && Array.from({ length: 801 }, (_, i) => i + 100).every(x => dense.inside(x, 300)), detail(profile(dense)));
      // Alternating positional jitter is adversarial for whole-stroke RDP.
      // Assert a deterministic work budget instead of hardware-dependent timing.
      const jitterPoints = Array.from({ length: 4096 }, (_, i) => [.1 + .8 * i / 4095, .5 + (i % 2 ? .001 : -.001), .5]);
      const originalHypot = Math.hypot;
      let hypotCalls = 0, noisy, elapsed;
      Math.hypot = (...values) => { hypotCalls++; return originalHypot(...values); };
      const started = performance.now();
      try { noisy = render(jitterPoints); } finally { elapsed = performance.now() - started; Math.hypot = originalHypot; }
      check('4096 jittery coordinates cannot trigger unbounded simplification work', hypotCalls < 1000000, 'distance calculations=' + hypotCalls + ', elapsed ms=' + elapsed.toFixed(1));
      check('bounded-work jitter rendering keeps raw coordinates unchanged', noisy.unchanged && jitterPoints.length === 4096);
      check('bounded-work jitter rendering remains finite and filled', noisy.nodes.every(node => !/NaN|Infinity/.test(node.getAttribute('d'))) && Array.from({ length: 781 }, (_, i) => i + 110).every(x => noisy.inside(x, 500)));

      const natural = render(line(4, i => i % 2 ? .85 : .15),5,'natural');
      check('Natural pressure jitter remains continuous without beading', profile(natural).ripple < .2 && Array.from({length:801},(_,i)=>i+100).every(x=>natural.inside(x,300)));
      check('Natural rendering preserves every raw pressure and coordinate', natural.unchanged);
      const naturalLight=profile(render(line(4,.15),5,'natural')),naturalHeavy=profile(render(line(4,.85),5,'natural'));
      check('Natural pressure remains expressive but gentler than Clean', naturalHeavy.mean/naturalLight.mean > 1.15 && naturalHeavy.mean/naturalLight.mean < heavy.mean/light.mean);
      const naturalSparse=render([point(100,300),point(900,300)],5,'natural');
      check('Natural sparse strokes taper both ends without narrowing the middle', widthAt(naturalSparse,100).width < widthAt(naturalSparse,500).width*.8 && widthAt(naturalSparse,900).width < widthAt(naturalSparse,500).width*.8);
      check('Natural taper has no centerline gaps', Array.from({length:801},(_,i)=>i+100).every(x=>naturalSparse.inside(x,300)));
      const naturalRuler=render([point(100,300),point(900,300)],5,'natural','line');
      check('held Natural lines keep steady width instead of tapered ruler ends', Math.abs(widthAt(naturalRuler,100).width-widthAt(naturalRuler,500).width)<.3);
      const naturalDense=render(densePoints,5,'natural'),naturalPath=naturalDense.nodes[0].getAttribute('d');
      check('Natural dense ink retains bounded display geometry', (naturalPath.match(/[mM]/g)||[]).length<120 && naturalPath.length<24000 && naturalDense.unchanged);
      const naturalLoop=render(loopPoints,5,'natural');
      check('Natural loops remain filled across crossings', loopPoints.every(p=>naturalLoop.inside(p[0]*1000,p[1]*1000)));
      const committed = [];
      const controller = PhloemInk.create({ pane: document.getElementById('pane'), getContext: () => ({ id: 'test' }),
        getTool: () => 'pen', getColor: () => 'black', getWidth: () => 5, getStrokes: () => [],
        onStart: () => {}, onErase: () => {}, onCommit: (_, stroke) => committed.push(stroke) });
      const dispatch = (type, x, y, pressure, coalesced) => {
        const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 99, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, pressure });
        if (coalesced) Object.defineProperty(event, 'getCoalescedEvents', { value: () => coalesced.map(sample => ({ clientX: sample[0], clientY: sample[1], pressure: sample[2] })) });
        sheet.dispatchEvent(event);
      };
      const samples = line(4, i => i % 2 ? .85 : .15).map(p => [p[0] * 1000, p[1] * 1000, p[2]]);
      dispatch('pointerdown', ...samples[0]);
      for (let i = 1; i < samples.length; i++) dispatch('pointermove', ...samples[i]);
      dispatch('pointerup', ...samples.at(-1));
      dispatch('pointerdown', ...samples[0]);
      for (let i = 1; i < samples.length; i += 8) {
        const packet = samples.slice(i, i + 8);
        dispatch('pointermove', ...packet.at(-1), packet);
      }
      dispatch('pointerup', ...samples.at(-1));
      check('individual and coalesced pointer samples each commit exactly one stroke', committed.length === 2 && !controller.active());
      check('coalescing does not lose or duplicate samples', JSON.stringify(committed[0]?.points) === JSON.stringify(committed[1]?.points));
      if (committed.length === 2) {
        const coalescedProfile = profile(render(committed[1].points));
        check('event-produced coalesced ink also suppresses pressure beads', coalescedProfile.ripple < .2, detail(coalescedProfile));
      }
      // Keep a repeatable visual fixture available for human review when requested.
      PhloemInk.render(sheet, [
        { id: 'jitter', color: 'red', width: 5, points: line(4, i => i % 2 ? .85 : .15) },
        { id: 'ramp', color: 'blue', width: 5, points: line(4, (_, x) => .1 + .8 * (x - 100) / 800).map(p => [p[0], p[1] + .2, p[2]]) },
        { id: 'corner', color: 'black', width: 5, points: cornerPoints.map(p => [p[0], p[1] + .35, p[2]]) },
        { id: 'loop', color: 'red', width: 5, points: loopPoints.map((p, i) => [p[0] + .25, p[1] + .25, i % 2 ? .85 : .15]) }
      ]);
      if(location.hash==='#natural-preview'){
        const sample=Array.from({length:401},(_,i)=>point(110+i*1.8,260+55*Math.sin(i/17)+20*Math.sin(i/5),.35+.3*Math.sin(i/31)));
        PhloemInk.render(sheet,[{id:'clean',color:'black',width:3,points:sample},{id:'natural',color:'black',width:3,style:'natural',points:sample.map(p=>[p[0],p[1]+.3,p[2]])}]);
        ['Clean','Natural · gentler pressure, tapered ends'].forEach((text,i)=>{const label=document.createElement('div');label.textContent=text;label.style.cssText='position:absolute;left:110px;top:'+(140+i*300)+'px;font:24px system-ui;color:#20313b';sheet.appendChild(label);});
      }
      return results;
    });
    results.push({ name: 'fixture has no JavaScript errors', pass: errors.length === 0, detail: errors.join('; ') });
    if (process.env.PHLOEM_INK_CONTINUITY_SCREENSHOT) await page.screenshot({ path: process.env.PHLOEM_INK_CONTINUITY_SCREENSHOT });
    for (const result of results) console.log((result.pass ? 'PASS' : 'FAIL') + '  ' + result.name + (result.detail ? '  [' + result.detail + ']' : ''));
    const failures = results.filter(result => !result.pass).length;
    console.log('\n' + (results.length - failures) + '/' + results.length + ' PDF ink continuity checks passed (' + browserName + ').');
    if (failures) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
