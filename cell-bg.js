/* ============================================================================
 * cell-bg.js — dark-field light micrograph of living plant leaf tissue
 * ---------------------------------------------------------------------------
 * Procedural, self-contained, zero dependencies. Ambient site backdrop:
 * deliberately subordinate to the copy that sits on top of it.
 *
 * Anatomy model:
 *   - cell layout  : variable-density staggered seed lattice with an
 *                    anisotropic (elliptical) local metric -> ~6.5% of seeds
 *                    culled -> 2 gentle Lloyd passes -> low-frequency domain
 *                    warp -> sliver guard -> true Voronoi tessellation
 *                    (half-plane clipping). Corners rounded; shared edges get
 *                    one canonical bulge so neighbours still tile exactly.
 *   - cell wall    : dark halo + per-segment refractive fringe (radial
 *                    chromatic aberration) + thin bright core line.
 *   - chloroplasts : pre-rendered sprite atlas (7 pigments x 12 orientations
 *                    x 3 focal planes), placed in a peripheral band via an
 *                    arc-length LUT around the outline, tangent-aligned.
 *   - vacuole      : cell centre left empty; the wall-bias exponent grows
 *                    with cell size so big cells stay hollow.
 *   - nucleus      : pale ellipse pressed against the wall in ~45% of cells.
 *   - depth of field: 3 planes (sharp / 1.1px / 2.2px), defocus dimmed+desat.
 *   - motion       : cytoplasmic streaming — granules creep along the
 *                    peripheral band at ~0.6-2.4 px/s. Nothing else moves.
 *   - legibility   : the region named by the canvas' data-safe-rect is
 *                    measured after the field is built and given a
 *                    per-field multiplicative gain (feathered over ~1.5 cell
 *                    widths) so body copy always lands on the same floor.
 *
 * Performance: two static offscreen layers (interiors, walls+vignette) built
 * once per field; each frame re-blits them and re-stamps granule sprites.
 * Redraw capped at 14 fps (30 fps during the 620 ms reseed cross-fade).
 *
 * API — window.CELL_BG = { start, stop, isSupported, reseed, seed, stats }.
 * Nothing is built at load; the first start() tessellates, paints and shows
 * #tissueBg. stop() cancels the loop and hides the canvas but keeps the field,
 * so a later start() resumes instantly.
 * ========================================================================== */

(function () {
  'use strict';

  /* This engine owns #tissueBg. The WebGL engine owns #bioBg — a canvas can
     hand out a webgl2 OR a 2d context, never both, so the two backdrops keep
     separate elements and a manager in site.js swaps between them.
     Nothing here runs until start() is called: building a field costs a
     Voronoi tessellation plus a sprite atlas, and this engine may never be
     the selected one. */
  var cvs = document.getElementById('tissueBg');
  var ctx = null;
  var ctxTried = false;

  /* Cheap, memoised, and safe to call before start(): getContext('2d') on our
     own canvas is idempotent and allocates only the default backing store. */
  function ensureCtx() {
    if (ctxTried) return !!ctx;
    ctxTried = true;
    if (!cvs || typeof cvs.getContext !== 'function') return false;
    try { ctx = cvs.getContext('2d', { alpha: false }) || null; }
    catch (e) { ctx = null; }
    return !!ctx;
  }

  /* ----------------------------- tunables --------------------------------- */

  var BG_CSS      = 'rgb(7,16,14)';   /* #07100e */
  var TARGET_FPS  = 14;
  var FADE_MS     = 620;
  var FADE_STEP   = 33;               /* ms between cross-fade frames        */
  var DPR_CAP     = 1.5;
  var MAX_BACKING = 3.6e6;            /* backing-store pixel budget per layer */

  var GRANULE_EXP = 0.60;             /* global exposure, chloroplasts        */
  var WALL_EXP    = 0.52;             /* global exposure, cell wall           */
  var LUMA_CAP    = 138;              /* hard ceiling on any emitted pixel    */

  var SPR         = 26;               /* sprite tile size (px, dpr-scaled)    */
  var NANG        = 12;               /* orientation buckets                  */
  var NPLANE      = 3;                /* focal planes: sharp, 1.1px, 2.2px    */
  var GRAN_MAX    = 13;               /* long axis of the sprite's ellipse    */
  var LUT_STEP    = 2.0;              /* arc-length resample step (css px)    */
  var GRAN_BUDGET = 12000;            /* max chloroplast stamps per frame     */

  var SLIVER_MIN  = 0.30;             /* reject inradius/circumradius below   */
  var SAFE_MEAN   = 17;               /* target mean L (0-255) in safe rect   */
  var SAFE_P99    = 82;               /* target p99  L (0-255) in safe rect   */
  var SAFE_FLOOR  = 0.34;             /* never dim the safe rect below this   */
  var SAFE_DEF    = [0, 0, 640, 420]; /* default safe rect, CSS px            */

  /* ------------------------------- PRNG ----------------------------------- */

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash3(a, b, c) {
    var h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1274126177;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function noise2(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash3(ix, iy, seed);
    var b = hash3(ix + 1, iy, seed);
    var c = hash3(ix, iy + 1, seed);
    var d = hash3(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ------------------------- colour helpers ------------------------------- */

  function hx(s) {
    var v = parseInt(s.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function luma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

  /* every colour that can end up as a visible pixel goes through here, so the
     brightest thing in the frame is bounded no matter how the gains stack   */
  function capped(c, k, a) {
    var r = c[0] * k, g = c[1] * k, b = c[2] * k;
    var L = luma(r, g, b);
    if (L > LUMA_CAP) { var s = LUMA_CAP / L; r *= s; g *= s; b *= s; }
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) +
           ',' + (a === undefined ? 1 : a) + ')';
  }

  /* pigment ramp, ordered bright yellow-green -> deep green so a per-cell
     bias shifts a whole cell's pigmentation coherently                       */
  var PIGMENT = [
    hx('#b6e86a'), hx('#8fdc5a'), hx('#6ccf62'), hx('#5fbf3f'),
    hx('#4aa83e'), hx('#2f8f47'), hx('#256f38')
  ];
  var PIG_W = [0.04, 0.14, 0.16, 0.20, 0.19, 0.17, 0.10]; /* pick weights */
  var PIG_CUM = (function () {
    var out = [], s = 0;
    for (var i = 0; i < PIG_W.length; i++) { s += PIG_W[i]; out.push(s); }
    for (i = 0; i < out.length; i++) out[i] /= s;
    return out;
  })();
  function pickPigment(u) {
    for (var i = 0; i < PIG_CUM.length; i++) if (u <= PIG_CUM[i]) return i;
    return PIG_CUM.length - 1;
  }

  var WALL_RGB = hx('#a8ecc4');

  /* ---------------------------- environment ------------------------------- */

  var W = 0, H = 0, DPR = 1;
  var field = null, prevField = null;
  var fadeStart = 0, fading = false;
  var rafId = 0, running = false, lastDraw = 0;
  /* enabled: the manager has selected us. booted: a field has been built. */
  var enabled = false, booted = false;
  var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var seedAttr = cvs ? parseInt(cvs.getAttribute('data-seed'), 10) : NaN;
  var seedCounter = isFinite(seedAttr) ? (seedAttr >>> 0)
                                       : ((Math.random() * 0x7fffffff) | 0);

  var mqReduce = null;
  try { mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) {}
  function reduced() { return !!(mqReduce && mqReduce.matches); }

  function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* the rectangle the site's hero copy occupies, in CSS px. An explicit
     data-safe-rect wins; otherwise measure the hero, which is the only
     place body text sits directly on the backdrop rather than on a panel
     (and which reflows between the desktop two-column and mobile stacked
     layouts, so a fixed rect would protect the wrong region). */
  function safeRect() {
    var a = (cvs.getAttribute('data-safe-rect') || '').split(/[,\s]+/);
    if (a.length === 4) {
      var p = [+a[0], +a[1], +a[2], +a[3]];
      if (p.every(function (q) { return isFinite(q); }) && p[2] > 0 && p[3] > 0) {
        return { x: p[0], y: p[1], w: p[2], h: p[3] };
      }
    }
    var hero = document.querySelector('.hero-copy');
    if (hero) {
      var r = hero.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return {
          x: Math.max(0, r.left + window.scrollX - 24),
          y: Math.max(0, r.top + window.scrollY - 24),
          w: r.width + 48,
          h: r.height + 48
        };
      }
    }
    return { x: SAFE_DEF[0], y: SAFE_DEF[1], w: SAFE_DEF[2], h: SAFE_DEF[3] };
  }

  /* ============================ SPRITE ATLAS =============================== */
  /* One offscreen atlas holds every chloroplast we will ever stamp:
   * columns = orientation buckets, rows = pigment, grouped by focal plane.   */

  function buildAtlas(dpr) {
    var tile = Math.round(SPR * dpr);
    var nPig = PIGMENT.length;
    var rows = nPig * NPLANE;
    var a = mkCanvas(tile * NANG, tile * rows);
    var g = a.getContext('2d');
    g.scale(dpr, dpr);

    var rx = GRAN_MAX * 0.5, ry = GRAN_MAX * 0.5 * 0.63;

    for (var p = 0; p < nPig; p++) {
      var col = PIGMENT[p];
      for (var k = 0; k < NANG; k++) {
        var cx = k * SPR + SPR * 0.5;
        var cy = p * SPR + SPR * 0.5;
        var ang = (k / NANG) * Math.PI;
        g.save();
        g.translate(cx, cy);
        g.rotate(ang);

        /* separation halo: a soft dark skirt so granules that touch stay
           visually discrete instead of fusing into a green mass          */
        var sh = g.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx * 1.5);
        sh.addColorStop(0.0, 'rgba(3,9,8,0.55)');
        sh.addColorStop(0.55, 'rgba(3,9,8,0.34)');
        sh.addColorStop(1.0, 'rgba(3,9,8,0)');
        g.fillStyle = sh;
        g.beginPath();
        g.save(); g.scale(1, ry / rx);
        g.arc(0, 0, rx * 1.5, 0, Math.PI * 2);
        g.restore();
        g.fill();

        /* body: darker core -> bright rim -> quick falloff (gives roundness) */
        var grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        grd.addColorStop(0.00, capped(col, 0.42 * GRANULE_EXP, 1));
        grd.addColorStop(0.42, capped(col, 0.62 * GRANULE_EXP, 1));
        grd.addColorStop(0.76, capped(col, 1.00 * GRANULE_EXP, 1));
        grd.addColorStop(0.90, capped(col, 0.74 * GRANULE_EXP, 0.95));
        grd.addColorStop(1.00, capped(col, 0.30 * GRANULE_EXP, 0));
        g.fillStyle = grd;
        g.beginPath();
        g.save();
        g.scale(1, ry / rx);
        g.arc(0, 0, rx, 0, Math.PI * 2);
        g.restore();
        g.fill();

        /* specular pip — sells the 3d lens shape at 8px. Deliberately weak:
           at 1:1 it contributes nothing but glare against 16px type.        */
        var hg = g.createRadialGradient(-rx * 0.26, -ry * 0.40, 0,
                                        -rx * 0.26, -ry * 0.40, rx * 0.44);
        hg.addColorStop(0, capped([196, 226, 178], 1.0 * GRANULE_EXP, 0.30));
        hg.addColorStop(1, capped([196, 226, 178], 1.0 * GRANULE_EXP, 0));
        g.fillStyle = hg;
        g.beginPath();
        g.arc(-rx * 0.26, -ry * 0.40, rx * 0.44, 0, Math.PI * 2);
        g.fill();

        g.restore();
      }
    }

    /* two defocused duplicates: dimmed and slightly desaturated, because an
       out-of-focus granule scatters its light over a wider disc             */
    var blurs = [1.1, 2.2], dim = [0.80, 0.72], sat = [0.80, 0.66];
    var canFilter = ('filter' in g);
    for (var pl = 1; pl < NPLANE; pl++) {
      g.save();
      if (canFilter) {
        g.filter = 'blur(' + blurs[pl - 1] + 'px) saturate(' + sat[pl - 1] +
                   ') brightness(' + dim[pl - 1] + ')';
      } else {
        g.globalAlpha = dim[pl - 1];
      }
      for (p = 0; p < nPig; p++) {
        g.drawImage(a,
          0, Math.round(p * SPR * dpr), Math.round(SPR * NANG * dpr), Math.round(SPR * dpr),
          0, (pl * nPig + p) * SPR, SPR * NANG, SPR);
      }
      g.restore();
    }

    /* belt and braces on peak brightness: clamp the atlas itself so no stamp
       can ever emit a pixel above LUMA_CAP whatever it is composited over   */
    try {
      var im = g.getImageData(0, 0, a.width, a.height);
      var d = im.data;
      for (var i = 0; i < d.length; i += 4) {
        var L = luma(d[i], d[i + 1], d[i + 2]);
        if (L > LUMA_CAP) {
          var s = LUMA_CAP / L;
          d[i] = d[i] * s; d[i + 1] = d[i + 1] * s; d[i + 2] = d[i + 2] * s;
        }
      }
      g.putImageData(im, 0, 0);
    } catch (e) { /* tainted or unsupported — the per-stop caps already apply */ }

    return { cvs: a, tile: tile, rows: rows };
  }

  /* =========================== GEOMETRY: VORONOI =========================== */

  /* --- seed lattice ------------------------------------------------------- *
   * Two fields drive it:
   *   density(x,y)  broad patches of coarser / finer tissue    (area variety)
   *   theta/ratio   a local elliptical metric so whole patches of cells come
   *                 out elongated, palisade-fashion, next to isodiametric
   *                 spongy-mesophyll patches.                               */

  function makeFields(S, nseed) {
    var fD  = 1 / (S * 4.5), fD2 = 1 / (S * 1.9), fD3 = 1 / (S * 0.85);
    var fT  = 1 / (S * 7.0), fK  = 1 / (S * 4.6);
    return {
      density: function (x, y) {
        var d = 0.55 * noise2(x * fD, y * fD, nseed) +
                0.30 * noise2(x * fD2 + 7.7, y * fD2 - 3.1, nseed + 5) +
                0.15 * noise2(x * fD3 - 2.9, y * fD3 + 6.4, nseed + 9);
        /* value noise piles up around 0.5; stretch it so the field actually
           contains coarse and fine tissue rather than one average pitch */
        return clamp(0.5 + (d - 0.5) * 3.6, 0, 1);
      },
      theta: function (x, y) {
        return noise2(x * fT + 2.3, y * fT + 5.1, nseed + 13) * Math.PI * 2.0;
      },
      ratio: function (x, y) {
        var a = noise2(x * fK - 4.4, y * fK + 1.9, nseed + 23);
        /* ~half the field isotropic, the rest up to 1.9:1 */
        return 1 + 0.90 * Math.max(0, (a - 0.36) / 0.64);
      }
    };
  }

  function genSeeds(rng, w, h, S, pad, nseed, F) {
    var xs = [], ys = [];

    /* radius of the local metric ellipse in direction phi */
    function ell(x, y, phi) {
      var p = S * (0.60 + 1.28 * F.density(x, y));
      var k = F.ratio(x, y), t = F.theta(x, y);
      var a = p * Math.sqrt(k), b = p / Math.sqrt(k);
      var c = Math.cos(phi - t), s = Math.sin(phi - t);
      return 1 / Math.sqrt(c * c / (a * a) + s * s / (b * b));
    }

    var y = -pad, row = 0;
    while (y < h + pad) {
      /* row height sampled at three x positions so a tall-cell patch on one
         side of the frame still opens the rows up locally                   */
      var rh = 0;
      for (var q = 0; q < 3; q++) {
        rh += ell(-pad + (w + 2 * pad) * (q + 0.5) / 3, y, Math.PI * 0.5);
      }
      rh /= 3;
      var stag = (row & 1) ? 0.5 : 0.0;
      var x = -pad;
      while (x < w + pad + S * 1.8) {
        var cw = ell(x, y + rh * 0.5, 0);
        xs.push(x + cw * (stag + 0.5) + (rng() - 0.5) * cw * 0.46);
        ys.push(y + rh * 0.5 + (rng() - 0.5) * rh * 0.46);
        x += cw;
      }
      y += rh; row++;
    }
    return { x: xs, y: ys, n: xs.length };
  }

  function buildGrid(px, py, n, box, gs) {
    var gw = Math.max(1, Math.ceil((box.x1 - box.x0) / gs));
    var gh = Math.max(1, Math.ceil((box.y1 - box.y0) / gs));
    var b = new Array(gw * gh);
    for (var i = 0; i < n; i++) {
      var gx = Math.min(gw - 1, Math.max(0, ((px[i] - box.x0) / gs) | 0));
      var gy = Math.min(gh - 1, Math.max(0, ((py[i] - box.y0) / gs) | 0));
      var k = gy * gw + gx;
      (b[k] || (b[k] = [])).push(i);
    }
    return { b: b, gw: gw, gh: gh, gs: gs, x0: box.x0, y0: box.y0 };
  }

  function clipHalf(poly, sx, sy, qx, qy, id) {
    var dx = qx - sx, dy = qy - sy;
    var c = dx * (sx + qx) * 0.5 + dy * (sy + qy) * 0.5;
    var out = [];
    var m = poly.length / 3;
    for (var i = 0; i < m; i++) {
      var ax = poly[i * 3], ay = poly[i * 3 + 1], ae = poly[i * 3 + 2];
      var j = (i + 1) % m;
      var bx = poly[j * 3], by = poly[j * 3 + 1];
      var fa = dx * ax + dy * ay - c;
      var fb = dx * bx + dy * by - c;
      var ina = fa <= 0, inb = fb <= 0;
      if (ina) out.push(ax, ay, ae);
      if (ina !== inb) {
        var t = fa / (fa - fb);
        out.push(ax + (bx - ax) * t, ay + (by - ay) * t, ina ? id : ae);
      }
    }
    return out;
  }

  function cellPoly(i, px, py, grid, box) {
    var sx = px[i], sy = py[i];
    var poly = [box.x0, box.y0, -1, box.x1, box.y0, -2,
                box.x1, box.y1, -3, box.x0, box.y1, -4];

    /* gather neighbour candidates from expanding grid rings */
    var gx = Math.min(grid.gw - 1, Math.max(0, ((sx - grid.x0) / grid.gs) | 0));
    var gy = Math.min(grid.gh - 1, Math.max(0, ((sy - grid.y0) / grid.gs) | 0));
    var cand = [], r = 1;
    while (true) {
      cand.length = 0;
      for (var yy = gy - r; yy <= gy + r; yy++) {
        if (yy < 0 || yy >= grid.gh) continue;
        for (var xx = gx - r; xx <= gx + r; xx++) {
          if (xx < 0 || xx >= grid.gw) continue;
          var bk = grid.b[yy * grid.gw + xx];
          if (!bk) continue;
          for (var q = 0; q < bk.length; q++) if (bk[q] !== i) cand.push(bk[q]);
        }
      }
      if (cand.length >= 18 || r >= 6) break;
      r++;
    }

    var order = cand.slice().sort(function (a, b) {
      var da = (px[a] - sx) * (px[a] - sx) + (py[a] - sy) * (py[a] - sy);
      var db = (px[b] - sx) * (px[b] - sx) + (py[b] - sy) * (py[b] - sy);
      return da - db;
    });

    for (var k = 0; k < order.length; k++) {
      var j = order[k];
      var d = Math.sqrt((px[j] - sx) * (px[j] - sx) + (py[j] - sy) * (py[j] - sy));
      /* max vertex radius: a bisector further than 2R cannot cut the cell */
      var maxR = 0;
      for (var v = 0; v < poly.length; v += 3) {
        var ddx = poly[v] - sx, ddy = poly[v + 1] - sy;
        var rr = ddx * ddx + ddy * ddy;
        if (rr > maxR) maxR = rr;
      }
      if (d > 2 * Math.sqrt(maxR)) break;
      poly = clipHalf(poly, sx, sy, px[j], py[j], j);
      if (poly.length < 9) return null;
    }
    return poly;
  }

  function polyCentroid(poly) {
    var m = poly.length / 3, a = 0, cx = 0, cy = 0;
    for (var i = 0; i < m; i++) {
      var j = (i + 1) % m;
      var x0 = poly[i * 3], y0 = poly[i * 3 + 1];
      var x1 = poly[j * 3], y1 = poly[j * 3 + 1];
      var f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-9) return null;
    a *= 0.5;
    return { x: cx / (6 * a), y: cy / (6 * a), area: Math.abs(a) };
  }

  /* shape metrics used by the sliver guard, the vacuole exponent and the
     anisotropy report                                                       */
  function polyShape(poly, cx, cy) {
    var m = poly.length / 3;
    var inr = Infinity, cir = 0;
    var mxx = 0, myy = 0, mxy = 0;
    for (var i = 0; i < m; i++) {
      var j = (i + 1) % m;
      var ax = poly[i * 3], ay = poly[i * 3 + 1];
      var bx = poly[j * 3], by = poly[j * 3 + 1];
      var ex = bx - ax, ey = by - ay;
      var L = Math.hypot(ex, ey);
      if (L > 1e-6) {
        var dist = Math.abs(ex * (cy - ay) - ey * (cx - ax)) / L;
        if (dist < inr) inr = dist;
      }
      var dx = ax - cx, dy = ay - cy;
      var rr = Math.hypot(dx, dy);
      if (rr > cir) cir = rr;
      mxx += dx * dx; myy += dy * dy; mxy += dx * dy;
    }
    mxx /= m; myy /= m; mxy /= m;
    var tr = mxx + myy;
    var disc = Math.sqrt(Math.max(0, tr * tr * 0.25 - (mxx * myy - mxy * mxy)));
    var l1 = tr * 0.5 + disc, l2 = tr * 0.5 - disc;
    return {
      inr: isFinite(inr) ? inr : 0,
      cir: cir,
      elong: Math.sqrt(l1 / Math.max(1e-9, l2)),
      axis: 0.5 * Math.atan2(2 * mxy, mxx - myy)
    };
  }

  /* ------------------- rounded + bulged cell outline ---------------------- */

  /* Drop near-duplicate vertices. Half-plane clipping routinely produces
     zero-length edges where three bisectors nearly concur; left in place they
     make the edge parameterisation blow up.                                 */
  function dedupe(poly, eps) {
    var m = poly.length / 3, out = [];
    for (var i = 0; i < m; i++) {
      var j = (i + 1) % m;
      var dx = poly[j * 3] - poly[i * 3], dy = poly[j * 3 + 1] - poly[i * 3 + 1];
      if (dx * dx + dy * dy < eps * eps) continue;   /* skip degenerate edge */
      out.push(poly[i * 3], poly[i * 3 + 1], poly[i * 3 + 2]);
    }
    return out;
  }

  function outlineOf(poly, site, px, py, RMAX, nseed) {
    var m = poly.length / 3;
    if (m < 3) return null;

    /* Each Voronoi edge is turned into ONE canonical quadratic Bezier whose
       endpoints are the two Voronoi vertices and whose control point is the
       edge midpoint pushed sideways by a hash of the (lo,hi) site pair. Both
       cells sharing the edge therefore generate the *identical* curve; only
       the parameter range differs (each cell trims back by its own corner
       radius). Without this the two cells' walls diverge and the shared wall
       renders as a doubled "railroad track".                                */
    var r = new Float64Array(m);
    var cxs = new Float64Array(m), cys = new Float64Array(m); /* control pts */
    var elen = new Float64Array(m);

    for (var i = 0; i < m; i++) {
      var n = (i + 1) % m;
      var dxe = poly[n * 3] - poly[i * 3], dye = poly[n * 3 + 1] - poly[i * 3 + 1];
      var L = Math.hypot(dxe, dye) || 1e-6;
      elen[i] = L;
      var bux = 0, buy = 0;
      var eid = poly[i * 3 + 2];
      if (eid >= 0) {
        var lo = Math.min(site, eid), hi = Math.max(site, eid);
        var dxs = px[hi] - px[lo], dys = py[hi] - py[lo];
        var dl = Math.hypot(dxs, dys) || 1e-6;
        var amt = (hash3(lo, hi, nseed) * 2 - 1) * 0.050 * L;
        bux = dxs / dl * amt; buy = dys / dl * amt;
      }
      /* control point that makes the curve pass through mid + bulge */
      cxs[i] = (poly[i * 3] + poly[n * 3]) * 0.5 + bux * 2;
      cys[i] = (poly[i * 3 + 1] + poly[n * 3 + 1]) * 0.5 + buy * 2;
    }
    for (i = 0; i < m; i++) {
      var p = (i - 1 + m) % m;
      r[i] = Math.min(RMAX, elen[p] * 0.32, elen[i] * 0.32);
    }

    function evalQ(e, t) {
      var a = e, b = (e + 1) % m, u = 1 - t;
      return [
        u * u * poly[a * 3] + 2 * u * t * cxs[e] + t * t * poly[b * 3],
        u * u * poly[a * 3 + 1] + 2 * u * t * cys[e] + t * t * poly[b * 3 + 1]
      ];
    }

    function tStart(e) { return Math.min(0.48, r[e] / elen[e]); }

    var ox = [], oy = [];
    var first = evalQ(0, tStart(0));
    ox.push(first[0]); oy.push(first[1]);

    for (i = 0; i < m; i++) {
      var ta = tStart(i);
      var tb = Math.max(0.52, 1 - r[(i + 1) % m] / elen[i]);
      if (tb <= ta) { ta = 0.49; tb = 0.51; }

      /* --- along the shared edge curve --- */
      var steps = Math.max(2, Math.min(16, Math.round(elen[i] * (tb - ta) / 7)));
      for (var s = 1; s <= steps; s++) {
        var q = evalQ(i, ta + (tb - ta) * s / steps);
        ox.push(q[0]); oy.push(q[1]);
      }

      /* --- rounded corner at the shared Voronoi vertex i+1 --- */
      var nn = (i + 1) % m;
      var en = evalQ(i, tb);
      var stp = evalQ(nn, tStart(nn));
      var vx = poly[nn * 3], vy = poly[nn * 3 + 1];
      for (s = 1; s <= 5; s++) {
        var t = s / 5, u2 = 1 - t;
        ox.push(u2 * u2 * en[0] + 2 * u2 * t * vx + t * t * stp[0]);
        oy.push(u2 * u2 * en[1] + 2 * u2 * t * vy + t * t * stp[1]);
      }
    }

    ox.pop(); oy.pop();   /* last corner point coincides with the first */
    for (i = 0; i < ox.length; i++) {
      if (!isFinite(ox[i]) || !isFinite(oy[i]) ||
          Math.abs(ox[i]) > 1e5 || Math.abs(oy[i]) > 1e5) return null;
    }
    return { x: ox, y: oy };
  }

  /* ---------------- arc-length LUT around the outline --------------------- */

  function makeLut(ox, oy, cx, cy) {
    var n = ox.length;
    var cum = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      cum[i + 1] = cum[i] + Math.hypot(ox[j] - ox[i], oy[j] - oy[i]);
    }
    var per = cum[n];
    if (!isFinite(per) || per <= 0) return null;
    var cnt = Math.max(8, Math.min(3000, Math.floor(per / LUT_STEP)));
    var step = per / cnt;
    var lx = new Float32Array(cnt), ly = new Float32Array(cnt);
    var nx = new Float32Array(cnt), ny = new Float32Array(cnt);
    var ai = new Uint8Array(cnt);
    var rad = new Float32Array(cnt);

    var seg = 0;
    for (var k = 0; k < cnt; k++) {
      var s = k * step;
      while (seg < n - 1 && cum[seg + 1] < s) seg++;
      var t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      var a = seg, b = (seg + 1) % n;
      var x = ox[a] + (ox[b] - ox[a]) * t;
      var y = oy[a] + (oy[b] - oy[a]) * t;
      var tx = ox[b] - ox[a], ty = oy[b] - oy[a];
      var tl = Math.hypot(tx, ty) || 1e-6;
      tx /= tl; ty /= tl;
      var vx = -ty, vy = tx;
      if (vx * (cx - x) + vy * (cy - y) < 0) { vx = -vx; vy = -vy; }
      lx[k] = x; ly[k] = y; nx[k] = vx; ny[k] = vy;   /* normals point inward */
      var ang = Math.atan2(ty, tx);
      if (ang < 0) ang += Math.PI;
      if (ang >= Math.PI) ang -= Math.PI;
      ai[k] = (ang / Math.PI * NANG) | 0;
      rad[k] = Math.hypot(cx - x, cy - y);
    }
    return { x: lx, y: ly, nx: nx, ny: ny, ang: ai, rad: rad, n: cnt, step: step, per: per };
  }

  /* ============================== FIELD ==================================== */

  var G_STRIDE = 6; /* s0, depth, scale, pigment, speed, phase */

  function pitchFor(w) {
    /* Bigger viewport -> bigger cells, not more of them. A flat sprite cap
       across a 2560px field starves every cell; scaling the pitch keeps each
       cell fully populated instead.                                         */
    return clamp(96 * Math.pow(Math.max(360, w) / 1280, 0.25), 90, 150);
  }

  function buildField(seed, w, h, dpr, atlas) {
    var rng = makeRng(seed);
    var nseed = seed & 0xffff;
    var S = pitchFor(w);
    var pad = S * 1.8;
    var box = { x0: -pad, y0: -pad, x1: w + pad, y1: h + pad };
    var F = makeFields(S, nseed);

    var sd = genSeeds(rng, w, h, S, pad, nseed, F);
    var px = sd.x, py = sd.y, n = sd.n;

    /* --- (1) cull ~6.5% of the lattice. Survivors absorb the vacated area,
       which is the cheapest way to break a lattice's uniform cell size. --- */
    var kx = [], ky = [];
    for (var i = 0; i < n; i++) {
      if (rng() < 0.065) continue;
      kx.push(px[i]); ky.push(py[i]);
    }
    px = kx; py = ky; n = px.length;

    /* --- (2) Lloyd relaxation: two gentle passes. Enough to kill the worst
       slivers, far too few to converge, so the density and anisotropy of the
       seed lattice survive instead of collapsing to a honeycomb.        --- */
    for (var it = 0; it < 2; it++) {
      var grid = buildGrid(px, py, n, box, S);
      var nx2 = new Array(n), ny2 = new Array(n);
      for (i = 0; i < n; i++) {
        var poly = cellPoly(i, px, py, grid, box);
        var c = poly && polyCentroid(poly);
        if (!c) { nx2[i] = px[i]; ny2[i] = py[i]; continue; }
        var f0 = 0.30;
        nx2[i] = px[i] + (c.x - px[i]) * f0;
        ny2[i] = py[i] + (c.y - py[i]) * f0;
      }
      px = nx2; py = ny2;
    }

    /* --- (3) low-frequency domain warp. Relaxation pulls everything toward
       a lattice; this pushes it back off, locally compressing and dilating
       the field so cell areas and orientations drift over ~6-8 cell spans. */
    var A = 0.46 * S;
    var wf = (Math.PI * 2) / (S * 7.0);
    var wrng = makeRng(seed ^ 0x5bf03635);
    var p1 = wrng() * 6.2832, p2 = wrng() * 6.2832, p3 = wrng() * 6.2832;
    for (i = 0; i < n; i++) {
      var x = px[i], y = py[i];
      px[i] = x + A * Math.sin(y * wf + p1) + 0.55 * A * Math.sin(x * 1.7 * wf + p3);
      py[i] = y + 0.7 * A * Math.sin(x * 0.9 * wf + p2);
    }

    /* --- (4) sliver guard. The warp can squeeze three sites nearly
       collinear, whose middle cell degenerates into a splinter and renders
       as a doubled "railroad track" wall. Drop those sites so the two
       neighbours simply merge across the gap, then re-check.            --- */
    for (var round = 0; round < 3; round++) {
      var g2 = buildGrid(px, py, n, box, S);
      var kill = null;
      for (i = 0; i < n; i++) {
        if (px[i] < -pad * 0.6 || px[i] > w + pad * 0.6 ||
            py[i] < -pad * 0.6 || py[i] > h + pad * 0.6) continue;
        var pj = cellPoly(i, px, py, g2, box);
        if (!pj || pj.length < 9) { (kill || (kill = {}))[i] = 1; continue; }
        var cj = polyCentroid(pj);
        if (!cj) { (kill || (kill = {}))[i] = 1; continue; }
        var sh = polyShape(pj, cj.x, cj.y);
        if (sh.cir > 1e-6 && sh.inr / sh.cir < SLIVER_MIN) (kill || (kill = {}))[i] = 1;
      }
      if (!kill) break;
      var ax = [], ay = [];
      for (i = 0; i < n; i++) if (!kill[i]) { ax.push(px[i]); ay.push(py[i]); }
      if (ax.length < n * 0.80) break;           /* refuse to gut the field */
      px = ax; py = ay; n = px.length;
    }

    /* --- (5) final tessellation --- */
    var grid2 = buildGrid(px, py, n, box, S);
    var cells = [];
    var margin = S * 0.95;
    for (i = 0; i < n; i++) {
      if (px[i] < -margin || px[i] > w + margin ||
          py[i] < -margin || py[i] > h + margin) continue;
      var poly2 = cellPoly(i, px, py, grid2, box);
      if (!poly2 || poly2.length < 9) continue;
      poly2 = dedupe(poly2, 0.75);
      if (poly2.length < 9) continue;
      var cen = polyCentroid(poly2);
      if (!cen || cen.area < 400) continue;
      var shp = polyShape(poly2, cen.x, cen.y);

      var RMAX = Math.min(11, Math.sqrt(cen.area) * 0.16);
      var out = outlineOf(poly2, i, px, py, RMAX, nseed);
      if (!out || out.x.length < 8) continue;

      var lut = makeLut(out.x, out.y, cen.x, cen.y);
      if (!lut) continue;

      var pr = rng();
      var plane = pr < 0.10 ? 2 : (pr < 0.22 ? 1 : 0);
      var tint = 0.80 + rng() * 0.40;

      /* --- chloroplast population, crowded against the wall --------------
         Depth is drawn from a wall-biased distribution whose exponent grows
         with cell size, so a big cell's vacuole stays as empty as a small
         one's instead of filling in through the middle.                    */
      var Req = Math.sqrt(cen.area / Math.PI);            /* equivalent radius */
      var crowd = 0.86 + rng() * 0.40;                    /* per-cell density  */
      var count = Math.max(16, Math.min(46,
                    Math.round(lut.per / 12.2 * crowd)));
      var gran = new Float32Array(count * G_STRIDE);
      var band = clamp(Req * (0.24 + 0.13 * rng()), 9, 26);
      var dexp = 2.4 + 1.0 * clamp((shp.inr - 45) / 45, 0, 1);
      var pigBias = (rng() - 0.5) * 0.46;   /* whole-cell pigmentation shift */
      /* granules jostle in loose clumps rather than spacing out evenly */
      var nClump = Math.max(3, Math.round(count / 4));
      var clumps = [];
      for (var q = 0; q < nClump; q++) clumps.push(rng() * lut.n);
      for (var k = 0; k < count; k++) {
        var u = rng();
        var depth = 5.0 + band * Math.pow(u, dexp);
        /* rare straggler on a transvacuolar strand */
        if (rng() < 0.030) depth += band * (0.8 + rng() * 1.4);
        var o = k * G_STRIDE;
        var s0 = (rng() < 0.45)
          ? clumps[(rng() * nClump) | 0] + (rng() - 0.5) * (lut.n / nClump) * 1.5
          : rng() * lut.n;
        var pu = rng() + pigBias;
        if (pu < 0.001) pu = 0.001; if (pu > 0.999) pu = 0.999;
        gran[o]     = s0;                                  /* s0 (lut index)  */
        gran[o + 1] = depth;
        gran[o + 2] = (7.4 + Math.pow(rng(), 0.75) * 5.8) / GRAN_MAX;
        gran[o + 3] = pickPigment(pu);
        gran[o + 4] = (0.6 + rng() * 1.8) * (rng() < 0.5 ? -1 : 1) / LUT_STEP;
        gran[o + 5] = (rng() * 255) | 0;
      }

      var nuc = null;
      if (rng() < 0.45) {
        var ni = (rng() * lut.n) | 0;
        var nd = 9 + rng() * 7;
        nuc = {
          x: lut.x[ni] + lut.nx[ni] * nd,
          y: lut.y[ni] + lut.ny[ni] * nd,
          r: 8 + rng() * 4,
          a: Math.atan2(lut.ny[ni], lut.nx[ni])
        };
      }

      var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (k = 0; k < out.x.length; k++) {
        if (out.x[k] < minx) minx = out.x[k];
        if (out.x[k] > maxx) maxx = out.x[k];
        if (out.y[k] < miny) miny = out.y[k];
        if (out.y[k] > maxy) maxy = out.y[k];
      }

      cells.push({
        ox: out.x, oy: out.y, cx: cen.x, cy: cen.y, area: cen.area,
        inr: shp.inr, cir: shp.cir, elong: shp.elong,
        minx: minx, maxx: maxx, miny: miny, maxy: maxy,
        lut: lut, plane: plane, tint: tint, gran: gran, gcount: count,
        gfull: count, nuc: nuc, dim: 1,
        wallK: 0.72 + rng() * 0.52   /* wall thickness/brightness varies */
      });
    }

    /* Per-frame sprite budget. Sharp cells are never thinned — a starved
       sharp cell is the most visible failure mode; only the defocused planes
       give up granules, and they are blurred anyway.                       */
    var sharpN = 0, softN = 0;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].plane === 0) sharpN += cells[i].gcount;
      else softN += cells[i].gcount;
    }
    if (sharpN + softN > GRAN_BUDGET && softN > 0) {
      var k2 = clamp((GRAN_BUDGET - sharpN) / softN, 0.35, 1);
      for (i = 0; i < cells.length; i++) {
        if (cells[i].plane === 0) continue;
        cells[i].gcount = Math.max(12, Math.round(cells[i].gcount * k2));
      }
    }

    var f = {
      seed: seed, w: w, h: h, dpr: dpr, S: S, cells: cells, atlas: atlas,
      base: null, walls: null, gain: 1, rect: null
    };

    /* --- legibility gain over the copy region, then bake the layers ------ */
    applySafeGain(f, safeRect());
    renderStatic(f);
    return f;
  }

  /* -------------------- legibility gain (safe rect) ----------------------- */

  function lumStats(data) {
    var hist = new Float64Array(256), n = 0, sum = 0;
    for (var i = 0; i < data.length; i += 4) {
      var L = luma(data[i], data[i + 1], data[i + 2]) | 0;
      if (L > 255) L = 255;
      hist[L]++; sum += L; n++;
    }
    var want = n * 0.99, acc = 0, p99 = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= want) { p99 = i; break; } }
    return { mean: n ? sum / n : 0, p99: p99 };
  }

  /* Render just the copy region into a small scratch canvas and read it back.
     Cheap (a few hundred k pixels, ~30 cells) and exact enough that the gain
     removes the seed-to-seed swing in how bright the hero area lands.       */
  function applySafeGain(f, rect) {
    f.rect = rect;
    var rw = Math.round(clamp(rect.w, 8, 900));
    var rh = Math.round(clamp(rect.h, 8, 700));
    var sub = [];
    for (var i = 0; i < f.cells.length; i++) {
      var c = f.cells[i];
      if (c.maxx < rect.x - 6 || c.minx > rect.x + rect.w + 6 ||
          c.maxy < rect.y - 6 || c.miny > rect.y + rect.h + 6) continue;
      sub.push(c);
    }
    if (!sub.length) return;

    var g, data;
    try {
      var mc = mkCanvas(rw, rh);
      g = mc.getContext('2d', { alpha: false });
      if (!g) return;
      g.fillStyle = BG_CSS; g.fillRect(0, 0, rw, rh);
      g.save();
      g.translate(-rect.x, -rect.y);
      for (var pl = NPLANE - 1; pl >= 0; pl--) paintInteriors(g, sub, pl);
      drawGranules(g, f, 0, sub, 1);
      for (pl = NPLANE - 1; pl >= 0; pl--) paintWalls(g, sub, pl, f.w * 0.5, f.h * 0.5);
      paintAmbient(g, f);
      g.restore();
      data = g.getImageData(0, 0, rw, rh).data;
    } catch (e) { return; }

    var s = lumStats(data);
    var gain = 1;
    if (s.mean > SAFE_MEAN) gain = Math.min(gain, SAFE_MEAN / s.mean);
    if (s.p99 > SAFE_P99) gain = Math.min(gain, SAFE_P99 / s.p99);
    gain = clamp(gain, SAFE_FLOOR, 1);
    f.gain = gain;
    f.measured = s;
    if (gain > 0.995) return;

    /* feather over ~1.5 cell widths so the boundary of the rect never reads
       as an edge; the per-cell quantisation hides it further                */
    var feather = f.S * 1.5;
    for (i = 0; i < f.cells.length; i++) {
      c = f.cells[i];
      var dx = Math.max(rect.x - c.cx, c.cx - (rect.x + rect.w), 0);
      var dy = Math.max(rect.y - c.cy, c.cy - (rect.y + rect.h), 0);
      var t = clamp(Math.hypot(dx, dy) / feather, 0, 1);
      t = t * t * (3 - 2 * t);
      c.dim = gain + (1 - gain) * t;
    }
  }

  /* ------------------------ static layer rendering ------------------------ */

  function pathCell(g, c) {
    var x = c.ox, y = c.oy;
    g.beginPath();
    g.moveTo(x[0], y[0]);
    for (var i = 1; i < x.length; i++) g.lineTo(x[i], y[i]);
    g.closePath();
  }

  function st(r, gn, b, t) {
    return 'rgba(' + Math.round(r * t) + ',' + Math.round(gn * t) + ',' +
           Math.round(b * t) + ',1)';
  }

  function paintInteriors(g, cells, plane) {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.plane !== plane) continue;
      /* vacuole dark, thin bright cytoplasm sleeve pressed against the wall */
      var R = Math.sqrt(c.area / Math.PI) * 1.30;
      var t = c.tint * (0.45 + 0.55 * c.dim);
      var gr = g.createRadialGradient(c.cx, c.cy, R * 0.05, c.cx, c.cy, R);
      gr.addColorStop(0.00, st(6, 13, 11, t));
      gr.addColorStop(0.55, st(7, 16, 13, t));
      gr.addColorStop(0.80, st(11, 25, 19, t));
      gr.addColorStop(0.94, st(19, 43, 32, t));
      gr.addColorStop(1.00, st(24, 54, 40, t));
      pathCell(g, c);
      g.fillStyle = gr;
      g.fill();

      if (c.nuc) {
        g.save();
        g.translate(c.nuc.x, c.nuc.y);
        g.rotate(c.nuc.a);
        var na = 0.50 * c.dim, nb = 0.40 * c.dim;
        var ng = g.createRadialGradient(0, 0, 0, 0, 0, c.nuc.r);
        ng.addColorStop(0.0, 'rgba(74,104,88,' + na.toFixed(3) + ')');
        ng.addColorStop(0.6, 'rgba(56,84,68,' + nb.toFixed(3) + ')');
        ng.addColorStop(1.0, 'rgba(30,52,42,0)');
        g.fillStyle = ng;
        g.beginPath();
        g.save(); g.scale(1, 0.78);
        g.arc(0, 0, c.nuc.r, 0, Math.PI * 2);
        g.restore();
        g.fill();
        g.restore();
      }
    }
  }

  /* Stroke the cell outline displaced along its own local normal, by the
     component of a constant radial displacement that is perpendicular to the
     wall. That is what transverse chromatic aberration actually does, and
     because the projection flips sign with the normal, two cells sharing a
     wall displace it identically instead of cancelling each other out.     */
  function strokeFringe(g, c, delta, cx, cy) {
    var l = c.lut, n = l.n;
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var k = i === n ? 0 : i;
      var rx = l.x[k] - cx, ry = l.y[k] - cy;
      var rl = Math.hypot(rx, ry) || 1e-6;
      var proj = (rx / rl) * l.nx[k] + (ry / rl) * l.ny[k];
      var d = delta * proj;
      var X = l.x[k] + l.nx[k] * d, Y = l.y[k] + l.ny[k] * d;
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke();
  }

  function paintWalls(g, cells, plane, fcx, fcy) {
    var i, c;

    /* pass 1 — dark halo: separates the bright line from the cytoplasm and
       makes the wall the crispest thing in the frame                        */
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(3,8,7,1)';
    g.lineWidth = 3.4;
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; if (c.plane !== plane) continue;
      pathCell(g, c); g.stroke();
    }

    /* pass 2 — refractive fringe, per segment (see strokeFringe) */
    g.lineWidth = 1.0;
    g.strokeStyle = capped([70, 205, 220], WALL_EXP, 0.26);
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; if (c.plane !== plane) continue;
      strokeFringe(g, c, 0.85 * c.dim, fcx, fcy);
    }
    g.strokeStyle = capped([215, 95, 200], WALL_EXP, 0.20);
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; if (c.plane !== plane) continue;
      strokeFringe(g, c, -0.85 * c.dim, fcx, fcy);
    }

    /* pass 3 — bright core line. Opaque, so the double-stroke along shared
       edges stays even; per-cell gain gives walls natural tonal variation
       instead of a uniform wireframe.                                       */
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; if (c.plane !== plane) continue;
      g.lineWidth = 0.95 + c.wallK * 0.28;
      g.strokeStyle = capped(WALL_RGB, WALL_EXP * c.wallK * c.dim, 1);
      pathCell(g, c); g.stroke();
    }
  }

  /* uneven condenser illumination + vignette, in canvas coordinates */
  function paintAmbient(g, f) {
    var irng = makeRng(f.seed ^ 0x9e3779b9);
    var big = Math.max(f.w, f.h);
    for (var q = 0; q < 5; q++) {
      var qx = irng() * f.w, qy = irng() * f.h;
      var qr = big * (0.26 + irng() * 0.34);
      var qa = 0.10 + irng() * 0.13;
      var sg = g.createRadialGradient(qx, qy, 0, qx, qy, qr);
      sg.addColorStop(0, 'rgba(4,10,9,' + qa.toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(4,10,9,0)');
      g.fillStyle = sg;
      g.fillRect(0, 0, f.w, f.h);
    }
    var d = Math.hypot(f.w, f.h) * 0.5;
    var vg = g.createRadialGradient(f.w * 0.5, f.h * 0.45, d * 0.24,
                                    f.w * 0.5, f.h * 0.45, d * 1.02);
    vg.addColorStop(0.00, 'rgba(5,12,11,0)');
    vg.addColorStop(0.55, 'rgba(5,12,11,0.26)');
    vg.addColorStop(1.00, 'rgba(4,10,9,0.82)');
    g.fillStyle = vg;
    g.fillRect(0, 0, f.w, f.h);
  }

  function renderStatic(f) {
    var bw = Math.max(1, Math.round(f.w * f.dpr));
    var bh = Math.max(1, Math.round(f.h * f.dpr));

    f.base = mkCanvas(bw, bh);
    f.walls = mkCanvas(bw, bh);
    var scratch = mkCanvas(bw, bh);

    var gb = f.base.getContext('2d');
    var gw = f.walls.getContext('2d');
    var gs = scratch.getContext('2d');
    gb.scale(f.dpr, f.dpr); gw.scale(f.dpr, f.dpr); gs.scale(f.dpr, f.dpr);

    gb.fillStyle = BG_CSS;
    gb.fillRect(0, 0, f.w, f.h);

    var canFilter = ('filter' in gb);
    var iBlur = [0, 1.3, 2.4], wBlur = [0, 1.15, 2.2], wA = [1, 0.94, 0.88];

    /* --- defocused planes, furthest first --- */
    for (var pl = NPLANE - 1; pl >= 1; pl--) {
      if (canFilter) {
        paintInteriors(gs, f.cells, pl);
        gb.save(); gb.filter = 'blur(' + iBlur[pl] + 'px)';
        gb.drawImage(scratch, 0, 0, f.w, f.h);
        gb.restore();
        gs.clearRect(0, 0, f.w, f.h);

        paintWalls(gs, f.cells, pl, f.w * 0.5, f.h * 0.5);
        gw.save(); gw.filter = 'blur(' + wBlur[pl] + 'px)'; gw.globalAlpha = wA[pl];
        gw.drawImage(scratch, 0, 0, f.w, f.h);
        gw.restore();
        gs.clearRect(0, 0, f.w, f.h);
      } else {
        paintInteriors(gb, f.cells, pl);
        paintWalls(gw, f.cells, pl, f.w * 0.5, f.h * 0.5);
      }
    }

    /* --- focal plane --- */
    paintInteriors(gb, f.cells, 0);
    paintWalls(gw, f.cells, 0, f.w * 0.5, f.h * 0.5);

    paintAmbient(gw, f);

    scratch.width = scratch.height = 1; /* release */
  }

  /* --------------------------- granule pass ------------------------------- */

  var SIN = new Float32Array(256);
  for (var si = 0; si < 256; si++) SIN[si] = Math.sin(si / 256 * Math.PI * 2);

  function drawGranules(g, f, tSec, cells, alpha) {
    var atlas = f.atlas, tile = atlas.tile, img = atlas.cvs;
    var nPig = PIGMENT.length;
    var wob = ((tSec * 9) | 0) & 255;
    var curA = -1;

    for (var ci = 0; ci < cells.length; ci++) {
      var c = cells[ci];
      var lut = c.lut, ln = lut.n;
      var rowOff = c.plane * nPig;
      var gran = c.gran, cnt = c.gcount;

      var a = alpha * c.dim;
      if (a !== curA) { g.globalAlpha = a; curA = a; }

      for (var k = 0; k < cnt; k++) {
        var o = k * G_STRIDE;
        var s = gran[o] + gran[o + 4] * tSec;
        s = s % ln; if (s < 0) s += ln;
        var i0 = s | 0;
        var fr = s - i0;
        var i1 = i0 + 1; if (i1 >= ln) i1 = 0;

        var bx = lut.x[i0] + (lut.x[i1] - lut.x[i0]) * fr;
        var by = lut.y[i0] + (lut.y[i1] - lut.y[i0]) * fr;
        var vx = lut.nx[i0], vy = lut.ny[i0];

        var ph = gran[o + 5] | 0;
        var d = gran[o + 1] + SIN[(ph + wob) & 255] * 1.5;
        var lim = lut.rad[i0] * 0.80;
        if (d > lim) d = lim;
        if (d < 3.4) d = 3.4;

        var gx = bx + vx * d, gy = by + vy * d;

        var ang = lut.ang[i0] + (ph & 3) + ((ph >> 4) & 1) - 2;
        ang %= NANG; if (ang < 0) ang += NANG;

        var sc = gran[o + 2];
        var dw = SPR * sc;
        g.drawImage(img,
          ang * tile, (rowOff + (gran[o + 3] | 0)) * tile, tile, tile,
          gx - dw * 0.5, gy - dw * 0.5, dw, dw);
      }
    }
    g.globalAlpha = 1;
  }

  function drawField(g, f, tSec, alpha) {
    g.globalAlpha = alpha;
    g.drawImage(f.base, 0, 0, f.w, f.h);
    g.globalAlpha = 1;
    drawGranules(g, f, tSec, f.cells, alpha);
    g.globalAlpha = alpha;
    g.drawImage(f.walls, 0, 0, f.w, f.h);
    g.globalAlpha = 1;
  }

  /* ============================== DRIVER =================================== */

  function paint(tMs) {
    if (!field) return;
    var tSec = (tMs - t0) / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG_CSS;
    ctx.fillRect(0, 0, W, H);

    if (fading && prevField) {
      var p = (tMs - fadeStart) / FADE_MS;
      if (p >= 1) { p = 1; fading = false; prevField = null; }
      else {
        drawField(ctx, prevField, tSec, 1);
        var e = p * p * (3 - 2 * p);
        drawField(ctx, field, tSec, e);
        return;
      }
    }
    drawField(ctx, field, tSec, 1);
  }

  /* The frame budget is spent by *sleeping*, not by waking at 60 Hz and
     discarding frames: a timer schedules the next rAF, so the compositor is
     woken ~14x/s instead of ~60x/s. rAF still gates the actual paint so the
     browser can suspend us when the tab is backgrounded.                    */
  var tickTimer = 0;

  function loop(ts) {
    rafId = 0;
    if (!running) return;
    lastDraw = ts;
    paint(ts);
    schedule();
  }

  function schedule() {
    if (!running) return;
    clearTimeout(tickTimer);
    /* ~19 steps across the 620 ms fade is smooth; 60 fps would double the
       transient cost of the most expensive frames we ever draw             */
    var delay = fading ? FADE_STEP : (1000 / TARGET_FPS);
    tickTimer = setTimeout(function () {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
    }, delay);
  }

  /* internal loop control — startLoop() only ever runs while the manager has
     selected us; the public start()/stop() below wrap these. */
  function startLoop() {
    if (running || reduced() || !enabled || !field) return;
    running = true;
    lastDraw = 0;
    schedule();
  }
  function stopLoop() {
    running = false;
    clearTimeout(tickTimer); tickTimer = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ------------------------------ sizing ---------------------------------- */

  var atlasCache = null;

  function measure() {
    var w = cvs.clientWidth || window.innerWidth || 1;
    var h = cvs.clientHeight || window.innerHeight || 1;
    var dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    var px = w * h * dpr * dpr;
    if (px > MAX_BACKING) dpr = Math.max(1, dpr * Math.sqrt(MAX_BACKING / px));
    return { w: w, h: h, dpr: dpr };
  }

  function rebuild(newSeed, crossfade) {
    var m = measure();
    W = m.w; H = m.h; DPR = m.dpr;
    cvs.width = Math.max(1, Math.round(W * DPR));
    cvs.height = Math.max(1, Math.round(H * DPR));

    if (!atlasCache || Math.abs(atlasCache.dpr - DPR) > 0.01) {
      atlasCache = buildAtlas(DPR);
      atlasCache.dpr = DPR;
    }

    var old = field;
    field = buildField(newSeed >>> 0, W, H, DPR, atlasCache);

    if (crossfade && old && !reduced()) {
      prevField = old;
      /* the outgoing field must match the new backing size */
      if (prevField.w !== W || prevField.h !== H) prevField = null;
      if (prevField) { fading = true; fadeStart = now(); }
    } else {
      prevField = null; fading = false;
    }

    if (reduced()) { stopLoop(); paint(now()); return; }

    /* A cross-fade frame draws BOTH fields. Doing that synchronously on the
       same tick that just built a field is the single longest block this
       module can produce, so on the reseed path we hand straight over to the
       scheduled loop and let it draw the first fade frame. Boot and resize
       still paint synchronously — there is nothing on screen yet.          */
    if (!(fading && prevField)) paint(now());
    if (!document.hidden) startLoop();
  }

  /* ------------------------------ events ---------------------------------- */

  /* Every handler is inert while we are not the selected engine: a resize or a
     scheme change that happens while the WebGL backdrop is on screen must not
     tessellate anything. start() re-checks the size instead. */
  var rzTimer = 0, lastW = 0, lastH = 0;
  function onResize() {
    if (!live()) return;
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () {
      if (!live()) return;
      var m = measure();
      if (Math.abs(m.w - lastW) < 2 && Math.abs(m.h - lastH) < 2) return;
      lastW = m.w; lastH = m.h;
      rebuild(seedCounter, false);
    }, 200);
  }

  function live() { return enabled && booted; }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (!live()) return;
    if (document.hidden) stopLoop();
    else if (!reduced()) { lastDraw = 0; startLoop(); }
  });

  if (mqReduce) {
    var onMQ = function () {
      if (!live()) return;
      if (reduced()) { stopLoop(); paint(now()); }
      else { lastDraw = 0; startLoop(); }
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMQ);
    else if (mqReduce.addListener) mqReduce.addListener(onMQ);
  }

  /* ---------------------------- lifecycle --------------------------------- */

  /* Build on first start(); afterwards a start() only has to unhide, re-check
     the viewport size (it may have changed while we were parked) and resume.
     The backing store survives being hidden, so a re-start with an unchanged
     size shows the same field it was showing before, no rebuild. */
  function startEngine() {
    if (!ensureCtx()) return;
    enabled = true;
    cvs.removeAttribute('hidden');

    if (!booted) {
      booted = true;
      var m0 = measure();
      lastW = m0.w; lastH = m0.h;
      rebuild(seedCounter, false);   /* first frame is drawn synchronously */
      /* styles.css keeps .bio-bg at opacity 0 until this class lands, so the
         tissue fades in rather than popping mid-build. */
      cvs.classList.add('is-live');
      return;
    }

    var m = measure();
    if (Math.abs(m.w - lastW) > 2 || Math.abs(m.h - lastH) > 2) {
      lastW = m.w; lastH = m.h;
      rebuild(seedCounter, false);
      return;
    }
    if (reduced()) { stopLoop(); paint(now()); return; }
    if (!document.hidden) { lastDraw = 0; startLoop(); }
  }

  /* Park: cancel the loop and hide the canvas. Nothing is released — the
     field, the atlas and the backing store all survive, so a later start()
     is instant. */
  function stopEngine() {
    enabled = false;
    stopLoop();
    clearTimeout(rzTimer); rzTimer = 0;
    fading = false; prevField = null;
    if (cvs) cvs.setAttribute('hidden', '');
  }

  /* ------------------------------- API ------------------------------------ */

  window.CELL_BG = {
    start: startEngine,
    stop: stopEngine,
    isSupported: ensureCtx,
    /* A reseed while parked just records the seed; the next start() builds
       with it (there is nothing on screen to cross-fade from anyway). */
    reseed: function (seed) {
      seedCounter = (seed === undefined || seed === null)
        ? ((Math.random() * 0x7fffffff) | 0)
        : (seed >>> 0);
      if (live()) rebuild(seedCounter, true);
      return seedCounter;
    },
    seed: function () { return seedCounter; },
    /* diagnostics — used by the calibration harness, harmless in production */
    stats: function () {
      if (!field) return null;
      var a = [], e = [], gs = [], gsoft = [], ir = [];
      for (var i = 0; i < field.cells.length; i++) {
        var c = field.cells[i];
        a.push(c.area); e.push(c.elong); ir.push(c.inr);
        (c.plane === 0 ? gs : gsoft).push(c.gcount);
      }
      return {
        seed: field.seed, w: field.w, h: field.h, S: field.S,
        n: field.cells.length, gain: field.gain, measured: field.measured || null,
        area: a, elong: e, inr: ir, granSharp: gs, granSoft: gsoft
      };
    }
  };

  /* No boot step: the manager in site.js decides who runs. */
})();
