# Bundled reader asset notices

Collected on 2026-09-15 for the Phloem iPad prototype. These files preserve upstream notices; they do not relicense Phloem's personal artwork or handwriting font.

## Identified assets

| Reader asset | Verified source | Included notice |
| --- | --- | --- |
| `vendor/pdfjs/pdf.min.js`, `pdf.worker.min.js` | Exact bytes from `pdfjs-dist@4.10.38`, `build/pdf.min.mjs` and `build/pdf.worker.min.mjs`; bundle reports version 4.10.38/build f9bea397f | `PDF.js-LICENSE.txt` copied from that npm archive |
| `vendor/tesseract/tesseract.min.js`, `worker.min.js` | Exact bytes from `tesseract.js@5.1.1`, `dist/` | `Tesseract.js-LICENSE.md` and both `.LICENSE.txt` companion files copied from that npm archive |
| Both `vendor/tesseract/tesseract-core-*-lstm.wasm.js` files | Exact bytes from `tesseract.js-core@5.1.1` | `Tesseract.js-core-LICENSE.txt` copied from that npm archive |
| `vendor/tesseract/{eng,fra,spa,chi_sim,jpn}.traineddata.gz` | Decompressed bytes exactly match `naptha/tessdata`, `gh-pages/4.0.0_fast/`; gzip container bytes differ | `Tessdata-LICENSE.txt` from that repository, license blob `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `fonts/dm-sans-var-latin.woff2` | Embedded name table identifies DM Sans 9pt, Version 4.004;gftools[0.9.30], copyright 2014 The DM Sans Project Authors, with SIL OFL URL | `DM-Sans-OFL.txt` from `google/fonts/ofl/dmsans/OFL.txt`, blob `4430b85ac62998e2edb914360f9ebdfe43f4deaa`; matching copyright |
| `fonts/houfu-hand.woff2` | Embedded name table says Myfont Regular, Version 001.001; no copyright/license entry was found there. Repository README explicitly identifies it as personal handwriting content, all rights reserved | No third-party license invented or applied. Preserve the repository owner's rights statement |

Sources: [PDF.js npm archive](https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz), [Tesseract.js npm archive](https://registry.npmjs.org/tesseract.js/-/tesseract.js-5.1.1.tgz), [Tesseract.js-core npm archive](https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-5.1.1.tgz), [Tesseract language data](https://github.com/naptha/tessdata/tree/gh-pages/4.0.0_fast), [DM Sans notice](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt).

The local `vendor/pdfjs/pdf.worker.compat.js` is Phloem's compatibility entry point, separate from the unchanged upstream worker. Existing license comments inside the upstream JavaScript must remain intact. In particular, the minified Tesseract bundles refer to the two companion files included here; the packager can also copy those next to the bundled JavaScript.

## JavaScript dependency notices

The Tesseract 5.1.1 [upstream lockfile](https://github.com/naptha/tesseract.js/blob/v5.1.1/package-lock.json) supplies the versions below. These notices cover browser runtime dependencies and dependencies named by the minified companion notices. They do not assert that every listed package has a separate runtime file in the final app.

The npm archive for each package was checked against the lockfile's integrity value before extracting its license. The exception is `idb-keyval`, whose `LICENCE` was read from its official GitHub v6.2.0 tag (blob `e234988309ac5645fdf88a85156381bbb6820dbe`).

| Package | Version | Notice |
| --- | --- | --- |
| `bmp-js` | 0.1.0 | `bmp-js-LICENSE` |
| `idb-keyval` | 6.2.0 | `idb-keyval-LICENCE` |
| `safari-14-idb-fix` | 3.0.0 | `safari-14-idb-fix-LICENSE` |
| `is-electron` | 2.2.2 | `is-electron-LICENSE` |
| `is-url` | 1.2.4 | `is-url-LICENSE-MIT` |
| `regenerator-runtime` | 0.13.11 | `regenerator-runtime-LICENSE` |
| `wasm-feature-detect` | 1.2.11 | `wasm-feature-detect-LICENSE` |
| `zlibjs` | 0.3.1 | `zlibjs-LICENSE` |
| `buffer` | 6.0.3 | `buffer-LICENSE` |
| `base64-js` | 1.5.1 | `base64-js-LICENSE` |
| `ieee754` | 1.2.1 | `ieee754-LICENSE` |

## Native OCR dependency notices

The Tesseract.js-core v5.1.1 [pinned submodule tree](https://github.com/naptha/tesseract.js-core/tree/v5.1.1/third_party) identifies the sources below. Their source license/notice texts are preserved. This collection does not claim a reproducible reconstruction of every object linked into the supplied WebAssembly binaries.

| Dependency | Pinned commit | Included source text |
| --- | --- | --- |
| Leptonica | `4af068b56a9674da915debea4ed7e1b9885b17e8` | `Leptonica-LICENSE.txt`, from DanBloomberg/leptonica `leptonica-license.txt` |
| giflib | `fa37672085ce4b3d62c51627ab3c8cf2dda8009a` | `GIFLIB-COPYING.txt`, from mirrorer/giflib |
| libjpeg | `6c0fcb8ddee365e7abc4d332662b06900612e923` | `Libjpeg-README.txt`, from LuaDist/libjpeg; includes license conditions |
| libpng | `a37d4836519517bdce6cb9d956092321eca3e73b` | `Libpng-LICENSE.txt`, from pnggroup/libpng at the same commit (the original glennrp path no longer resolved) |
| libtiff | `b51bb157123264e26d34c09cc673d213aea61fc7` | `Libtiff-COPYRIGHT.txt`, from the official GitLab libtiff/libtiff repository |
| libwebp | `20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c` | `Libwebp-COPYING.txt`, `Libwebp-PATENTS.txt`, from webmproject/libwebp |
| openlibm | `ae2d91698508701c83cab83714d42a1146dccf85` | `Openlibm-LICENSE.md`, from JuliaMath/openlibm |
| Tesseract OCR fork used by the core | `e20b1c6553c8f68c4bbff1feef0a64064959a427` | `Tesseract-OCR-LICENSE.txt`, from Balearica/tesseract |
| zlib | `21767c654d31d2dccdde4330529775c6c5fd5389` | `Zlib-README.txt`, from madler/zlib; includes license conditions |

This software is based in part on the work of the Independent JPEG Group.

## Recheck boundaries

This is a provenance record for the existing reader assets, not a blanket statement that an App Store release has completed its dependency review. Generated Capacitor/native package dependencies and compiler runtime notices must be checked against the eventual release build. The precise download URL of the DM Sans WOFF2 conversion and the authorship/toolchain of the custom handwriting font were not recoverable from the repository alone.

## Local asset SHA-256 fingerprints

These fingerprints identify the exact asset copies checked above; OCR data hashes here cover the repository's compressed files.

```text
27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c  vendor/pdfjs/pdf.min.js
64df091e37259c204c9e383d2eb1ac4db966e5969643e75b9be54ae789cb95af  vendor/pdfjs/pdf.worker.compat.js
1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36  vendor/pdfjs/pdf.worker.min.js
f8586e74b311487fdebb1c1ced8baaa13aa8bbc3ba7a30bdfc8270b056865ab7  vendor/tesseract/chi_sim.traineddata.gz
6112f513f26530cb51482d9a005beff066f28073cd18c672271c527980a4b471  vendor/tesseract/eng.traineddata.gz
9a9c3e34f835f61b9b9581a96516b6f922d1cde9dbe20d84a41a920b9ba9e946  vendor/tesseract/fra.traineddata.gz
4b4a2ef6e5ff7018cbfd926667101bd8365a20da55ae527ee70e3b23ffe89f9a  vendor/tesseract/jpn.traineddata.gz
82845b46107f1c72f3f7d7ab45372caea46e706134a9ef45b59029180b464376  vendor/tesseract/spa.traineddata.gz
8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa  vendor/tesseract/tesseract-core-lstm.wasm.js
ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf  vendor/tesseract/tesseract-core-simd-lstm.wasm.js
a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8  vendor/tesseract/tesseract.min.js
aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc  vendor/tesseract/worker.min.js
468d56b6b25b05b70190b6c233d773f6f1770e8579827ce022a57f03fa8002fb  fonts/dm-sans-var-latin.woff2
0f7c26e02871e4cf311f2db4aebd48b2f2282c34b7f49a687d25ecbc99110b28  fonts/houfu-hand.woff2
```
