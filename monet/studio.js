/* Monet Light Strokes studio: a visitor picks a photo and gets the painting
   back from the monet-studio Worker (/monet-studio), which runs the open-source
   skill. With no Worker URL on the dialog, the page keeps the personal request
   flow and this script does nothing. */
(() => {
    'use strict';

    const studio = document.getElementById('monetStudio');
    const endpoint = (studio?.dataset.endpoint || '').trim().replace(/\/+$/, '');
    if (!studio || !endpoint || typeof studio.showModal !== 'function') return;

    // The Worker matches its canvas to this photo, so 1536px keeps the upload
    // near 1 MB without losing anything the painting can use.
    const MAX_EDGE = 1536;
    const MIN_EDGE = 256;
    const MAX_FILE_BYTES = 40 * 1024 * 1024;
    const TIMEOUT_MS = 5 * 60 * 1000;
    // OpenAI refusing a photo; the Worker recognises the same words.
    const POLICY = /moderation|safety(?!_identifier)|content[ _-]?policy|usage policy|invalid_prompt|bio_policy|content_filter/i;
    // Errors that the same photo cannot fix by trying again.
    const FINAL_ERRORS = /^(limit|blocked|closed|bad_photo|not_image|too_)/;

    const COPY = {
        en: {
            close: 'Close',
            start: 'Paint it',
            download: 'Download painting',
            retry: 'Try again',
            again: 'Choose another photo',
            compareOff: 'Show my photo',
            compareOn: 'Show the painting',
            personal: 'Ask Houfu to paint it personally ↗',
            photoAlt: 'Your photo',
            paintingAlt: 'Your photo repainted in Monet Light Strokes',
            left: (n) => (n === 1 ? '1 painting left for you today.' : `${n} paintings left for you today.`),
            ready: 'One photo becomes one painting. Ready when you are.',
            preparing: 'Opening your photo…',
            wait: 'Usually about a minute. Keep this window open.',
            done: 'Finished. Every painting is one of a kind; the light falls differently each time.',
            stages: {
                sending: 'Sending your photo',
                reading: 'Reading the light',
                composing: 'Laying in the masses',
                painting: 'Painting',
                partial: ['Underpainting', 'Broken color', 'Final passes'],
                finishing: 'Varnishing'
            },
            errors: {
                limit: 'Today’s paintings are used up. Come back tomorrow, or ask Houfu to paint one personally.',
                limit_total: 'The studio has painted all it can today and reopens tomorrow. Houfu can still paint one personally.',
                blocked: 'OpenAI’s safety check turned this photo down. Try a different one.',
                not_image: 'This browser can’t open that file as a photo. Try a JPG or PNG.',
                too_big: 'That file is over 40 MB. Try a smaller photo.',
                too_small: 'That photo is too small to paint. Use one at least 256 pixels on each side.',
                too_narrow: 'That photo is too long and thin to paint. Try one with a more usual shape.',
                bad_photo: 'The studio couldn’t read that photo. Try a different one.',
                closed: 'The studio is closed for now. Houfu can still paint one for you personally.',
                timeout: 'This one is taking too long. Try again in a moment.',
                upstream: 'The studio couldn’t finish this one. Try again in a moment.'
            }
        },
        zh: {
            close: '关闭',
            start: '开始作画',
            download: '下载画作',
            retry: '再试一次',
            again: '换一张照片',
            compareOff: '看原照片',
            compareOn: '看画作',
            personal: '请厚孚亲自画 ↗',
            photoAlt: '你的照片',
            paintingAlt: '以莫奈光影笔触重绘的照片',
            left: (n) => `今天你还可以画 ${n} 幅。`,
            ready: '一张照片，换一幅画。准备好了就开始。',
            preparing: '正在打开照片…',
            wait: '通常约一分钟，请保持此窗口打开。',
            done: '完成。每一幅都独一无二，光每次都落得不同。',
            stages: {
                sending: '正在上传照片',
                reading: '正在读光',
                composing: '铺陈大色块',
                painting: '正在作画',
                partial: ['铺底色', '破色笔触', '最后几遍'],
                finishing: '上光收尾'
            },
            errors: {
                limit: '今天的次数已用完。明天再来，或请厚孚亲自为你画一幅。',
                limit_total: '画室今天已画满，明天重新开放；也可以请厚孚亲自画。',
                blocked: 'OpenAI 的安全审核未通过这张照片，请换一张。',
                not_image: '浏览器无法把这个文件当作照片打开，请换成 JPG 或 PNG。',
                too_big: '文件超过 40 MB，请换一张小一些的照片。',
                too_small: '照片太小，无法作画。请使用每边至少 256 像素的照片。',
                too_narrow: '这张照片太细长了，无法作画。请换一张比例常见一些的照片。',
                bad_photo: '画室无法读取这张照片，请换一张。',
                closed: '画室暂时关闭，厚孚仍可以亲自为你画一幅。',
                timeout: '这次等待太久了，请稍后再试。',
                upstream: '画室这次没能完成，请稍后再试。'
            }
        }
    };

    const $ = (name) => studio.querySelector(`[data-studio-${name}]`);
    const els = {
        close: $('close'),
        drop: $('drop'),
        file: $('file'),
        easel: $('easel'),
        photo: $('photo'),
        painting: $('painting'),
        stage: $('stage'),
        status: $('status'),
        start: $('start'),
        download: $('download'),
        retry: $('retry'),
        compare: $('compare'),
        again: $('again'),
        personal: $('personal'),
        left: $('left')
    };

    const state = {
        view: 'pick',      // pick | ready | painting | done | error
        photo: null,       // { dataUrl, previewUrl, width, height, name }
        preparing: false,  // a newly chosen photo is still being decoded
        notice: '',        // a problem with a newly chosen photo, shown without losing the current one
        closed: false,     // the Worker reports the studio closed
        paintingUrl: '',
        stage: '',         // a key of COPY.*.stages, or partial0, partial1, ...
        startedAt: 0,
        error: '',
        left: null,
        comparing: false
    };
    let ticker = 0;
    let chosen = 0;        // counts photo choices, so only the latest one lands

    class StudioError extends Error {
        constructor(code) {
            super(code);
            this.code = code;
        }
    }

    const copy = () => COPY[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];

    function elapsed() {
        const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }

    // The stage caption is not a live region, so it can tick every second.
    function renderStage() {
        const stages = copy().stages;
        const partial = /^partial(\d+)$/.exec(state.stage);
        const label = partial
            ? stages.partial[Math.min(Number(partial[1]), stages.partial.length - 1)]
            : stages[state.stage];
        els.stage.textContent = state.view === 'painting' && label ? `${label} · ${elapsed()}` : '';
    }

    function render() {
        const text = copy();
        const { view } = state;
        const settled = !state.preparing;
        const show = {
            drop: view === 'pick' || (view === 'error' && !state.photo),
            easel: view !== 'pick' && Boolean(state.photo),
            start: view === 'ready' && settled,
            download: view === 'done',
            retry: view === 'error' && settled && Boolean(state.photo) && !FINAL_ERRORS.test(state.error),
            compare: view === 'done',
            again: settled && (view === 'ready' || view === 'done' || (view === 'error' && Boolean(state.photo))),
            personal: view === 'error' || (view === 'pick' && (state.left === 0 || state.closed))
        };
        Object.entries(show).forEach(([name, visible]) => { els[name].hidden = !visible; });

        els.close.setAttribute('aria-label', text.close);
        els.start.textContent = text.start;
        els.download.textContent = text.download;
        els.retry.textContent = text.retry;
        els.again.textContent = text.again;
        els.personal.textContent = text.personal;
        // The label names the action, so it is not also a pressed toggle.
        els.compare.textContent = state.comparing ? text.compareOn : text.compareOff;
        els.compare.classList.toggle('is-on', state.comparing);
        els.photo.alt = text.photoAlt;
        els.painting.alt = view === 'done' ? text.paintingAlt : '';

        studio.classList.toggle('is-painting', view === 'painting');
        els.easel.classList.toggle('is-done', view === 'done');
        els.easel.classList.toggle('is-comparing', view === 'done' && state.comparing);
        els.painting.classList.toggle('is-visible', Boolean(state.paintingUrl));

        renderStage();

        let status = '';
        if (state.preparing) status = text.preparing;
        else if (state.notice) status = text.errors[state.notice] || text.errors.not_image;
        else if (view === 'error') status = text.errors[state.error] || text.errors.upstream;
        else if (view === 'painting') status = text.wait;
        else if (view === 'done') status = text.done;
        else if (view === 'ready') status = text.ready;
        else if (state.closed) status = text.errors.closed;
        else if (state.left === 0) status = text.errors.limit;
        // Rewriting a live region re-announces it, so only write real changes.
        if (els.status.textContent !== status) els.status.textContent = status;
        els.status.classList.toggle('is-error', !state.preparing
            && (Boolean(state.notice) || view === 'error' || (view === 'pick' && (state.left === 0 || state.closed))));
        els.left.textContent = typeof state.left === 'number' && state.left > 0 ? `${text.left(state.left)} ` : '';

        // Keep keyboard focus inside the dialog when the focused control hides.
        const active = document.activeElement;
        if (studio.open && (!studio.contains(active) || active.closest('[hidden]'))) {
            const next = [els.start, els.download, els.retry, els.again, els.personal]
                .find((element) => !element.hidden) || (view === 'pick' ? els.file : els.close);
            next.focus({ preventScroll: true });
        }
    }

    function setStage(stage) {
        state.stage = stage;
        render();
    }

    function fail(code) {
        clearInterval(ticker);
        state.view = 'error';
        state.error = code;
        render();
    }

    async function refreshLeft() {
        try {
            const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
            if (!response.ok) return;
            const body = await response.json();
            if (Number.isFinite(body.left)) state.left = body.left;
            state.closed = body.open === false;
            render();
        } catch {
            // The count is a courtesy; painting still reports limits itself.
        }
    }

    function decodeImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new StudioError('not_image')); };
            image.src = url;
        });
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new StudioError('not_image'));
            reader.readAsDataURL(blob);
        });
    }

    async function preparePhoto(file) {
        if (!file) throw new StudioError('not_image');
        if (file.type && !file.type.startsWith('image/')) throw new StudioError('not_image');
        if (file.size > MAX_FILE_BYTES) throw new StudioError('too_big');
        let source;
        try {
            source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            source = await decodeImage(file);
        }
        const sourceWidth = source.width;
        const sourceHeight = source.height;
        if (Math.min(sourceWidth, sourceHeight) < MIN_EDGE) throw new StudioError('too_small');
        const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
        const width = Math.round(sourceWidth * scale);
        const height = Math.round(sourceHeight * scale);
        if (Math.min(width, height) < 64) throw new StudioError('too_narrow');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';      // transparent PNGs paint on white, not black
        context.fillRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);
        source.close?.();
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((result) => (result ? resolve(result) : reject(new StudioError('not_image'))), 'image/jpeg', 0.9);
        });
        return {
            dataUrl: await blobToDataUrl(blob),
            previewUrl: URL.createObjectURL(blob),
            width,
            height,
            name: (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
        };
    }

    function clearPainting() {
        if (state.paintingUrl.startsWith('blob:')) URL.revokeObjectURL(state.paintingUrl);
        state.paintingUrl = '';
        els.painting.removeAttribute('src');
        els.download.removeAttribute('href');
        state.comparing = false;
    }

    // Decoding a large phone photo takes a moment; until it lands, nothing
    // that would paint or replace the current photo is offered.
    async function choose(file) {
        if (state.view === 'painting') return;
        const choice = ++chosen;
        state.preparing = true;
        state.notice = '';
        render();
        let photo = null;
        let failure = '';
        try {
            photo = await preparePhoto(file);
        } catch (error) {
            failure = error instanceof StudioError ? error.code : 'not_image';
        }
        if (choice !== chosen || state.view === 'painting') {
            if (photo) URL.revokeObjectURL(photo.previewUrl);
            return;
        }
        state.preparing = false;
        if (failure) {
            // Keep the current photo and any painting (already paid for);
            // just say why the new one can't be used.
            if (state.photo) {
                state.notice = failure;
                render();
            } else {
                fail(failure);
            }
            return;
        }
        if (state.photo) URL.revokeObjectURL(state.photo.previewUrl);
        clearPainting();
        state.photo = photo;
        els.photo.src = photo.previewUrl;
        state.view = 'ready';
        render();
    }

    function imageType(base64) {
        if (base64.startsWith('iVBOR')) return 'image/png';
        if (base64.startsWith('UklGR')) return 'image/webp';
        return 'image/jpeg';
    }

    function showPartial(base64) {
        state.paintingUrl = `data:${imageType(base64)};base64,${base64}`;
        els.painting.src = state.paintingUrl;
        render();
    }

    function showFinal(base64, photo) {
        const type = imageType(base64);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        clearPainting();
        state.paintingUrl = URL.createObjectURL(new Blob([bytes], { type }));
        els.painting.src = state.paintingUrl;
        els.download.href = state.paintingUrl;
        els.download.download = `${photo.name}-monet-light-strokes.${type.split('/')[1].replace('jpeg', 'jpg')}`;
        clearInterval(ticker);
        state.view = 'done';
        render();
    }

    function errorCode(error, reason = '') {
        const detail = `${error?.code || ''} ${error?.message || ''} ${reason}`;
        return POLICY.test(detail) ? 'blocked' : 'upstream';
    }

    function streamError(event) {
        const response = event.response || {};
        return errorCode(response.error || event.error || event, response.incomplete_details?.reason);
    }

    // OpenAI's Responses stream, relayed untouched by the Worker.
    function handleEvent(event, progress) {
        switch (event.type) {
            case 'response.created':
            case 'response.in_progress':
                if (!progress.partials) setStage('reading');
                break;
            case 'response.output_item.added':
                if (event.item?.type === 'image_generation_call') setStage('composing');
                break;
            case 'response.image_generation_call.in_progress':
                setStage('composing');
                break;
            case 'response.image_generation_call.generating':
                if (!progress.partials) setStage('painting');
                break;
            case 'response.image_generation_call.partial_image':
                if (!event.partial_image_b64) break;
                progress.partials += 1;
                showPartial(event.partial_image_b64);
                setStage(`partial${Number(event.partial_image_index) || 0}`);
                break;
            case 'response.output_item.done':
                if (event.item?.type !== 'image_generation_call') break;
                if (event.item.result) progress.final = event.item.result;
                else if (event.item.status === 'failed') progress.error = errorCode(event.item.error);
                break;
            case 'response.completed': {
                const call = (event.response?.output || []).find((item) => item.type === 'image_generation_call' && item.result);
                if (!progress.final && call) progress.final = call.result;
                break;
            }
            case 'response.failed':
            case 'response.incomplete':
            case 'error':
                progress.error = streamError(event);
                break;
            default:
                break;
        }
    }

    async function readStream(response, progress) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let scanned = 0;
        for (;;) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n?/g, '\n');
            let boundary;
            while ((boundary = buffer.indexOf('\n\n', scanned)) >= 0) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                scanned = 0;
                const data = block.split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).replace(/^ /, ''))
                    .join('\n');
                if (!data || data === '[DONE]') continue;
                let event;
                try {
                    event = JSON.parse(data);
                } catch {
                    continue;
                }
                handleEvent(event, progress);
                // The painting is in hand. response.completed would only send
                // the same image again, so stop downloading.
                if (progress.final) {
                    reader.cancel().catch(() => {});
                    return;
                }
            }
            // A multi-megabyte image event arrives in many chunks; don't rescan it.
            scanned = Math.max(0, buffer.length - 1);
            if (done) return;
        }
    }

    async function paint() {
        if (!state.photo || state.preparing || state.view === 'painting') return;
        const photo = state.photo;
        clearPainting();
        state.view = 'painting';
        state.error = '';
        state.notice = '';
        state.startedAt = Date.now();
        state.stage = 'sending';
        clearInterval(ticker);
        ticker = setInterval(renderStage, 1000);
        render();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const progress = { partials: 0, final: '', error: '' };
        try {
            const response = await fetch(`${endpoint}/paint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: photo.dataUrl, width: photo.width, height: photo.height }),
                signal: controller.signal
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (Number.isFinite(body.left)) state.left = body.left;
                if (body.error === 'limit') {
                    state.left = 0;
                    fail(body.scope === 'total' ? 'limit_total' : 'limit');
                } else if (body.error === 'blocked' || body.error === 'closed' || body.error === 'not_configured') {
                    fail(body.error === 'blocked' ? 'blocked' : 'closed');
                } else {
                    fail(response.status === 400 || response.status === 413 ? 'bad_photo' : 'upstream');
                }
                return;
            }
            const left = Number.parseInt(response.headers.get('X-Paintings-Left') || '', 10);
            if (Number.isFinite(left)) state.left = left;
            setStage('reading');
            await readStream(response, progress);
            if (progress.final) showFinal(progress.final, photo);
            else fail(progress.error || 'upstream');
        } catch (error) {
            // readStream returns as soon as the painting arrives, so a drop
            // after that never reaches here.
            fail(error?.name === 'AbortError' ? 'timeout' : 'upstream');
        } finally {
            clearTimeout(timer);
            // A failed painting may have been given back after the count was sent.
            refreshLeft();
        }
    }

    function open() {
        if (!studio.open) studio.showModal();
        render();
        refreshLeft();
    }

    function pickAnother() {
        els.file.value = '';
        els.file.click();
    }

    // Reveal the studio and keep the personal request one link away.
    document.querySelectorAll('[data-studio-entry]').forEach((element) => { element.hidden = false; });
    document.querySelectorAll('[data-personal-entry]').forEach((element) => { element.hidden = true; });
    document.querySelectorAll('[data-personal-link]').forEach((element) => { element.hidden = false; });
    document.querySelectorAll('[data-studio-open]').forEach((button) => button.addEventListener('click', open));

    els.close.addEventListener('click', () => studio.close());
    studio.addEventListener('click', (event) => {
        // The dialog itself is also the target for clicks on its scrollbar,
        // so close only for clicks that land outside it, on the backdrop.
        if (event.target !== studio) return;
        const box = studio.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) studio.close();
    });
    els.file.addEventListener('change', () => {
        const [file] = els.file.files;
        els.file.value = '';        // so picking the same photo again still counts
        if (file) choose(file);
    });
    els.start.addEventListener('click', paint);
    els.retry.addEventListener('click', paint);
    els.again.addEventListener('click', pickAnother);
    els.compare.addEventListener('click', () => {
        state.comparing = !state.comparing;
        render();
    });

    studio.addEventListener('dragover', (event) => {
        if (state.view === 'painting' || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
        event.preventDefault();
        studio.classList.add('is-dragging');
    });
    studio.addEventListener('dragleave', (event) => {
        if (!studio.contains(event.relatedTarget)) studio.classList.remove('is-dragging');
    });
    studio.addEventListener('drop', (event) => {
        studio.classList.remove('is-dragging');
        if (state.view === 'painting' || !event.dataTransfer?.files.length) return;
        event.preventDefault();
        choose(event.dataTransfer.files[0]);
    });

    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    if (location.hash === '#studio') open();
})();
