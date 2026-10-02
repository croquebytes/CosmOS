/**
 * Computed contrast, measured against what is actually painted.
 *
 * Reading background-color up the tree is not enough here: the vellum is a
 * stack of gradients, the felt and the tape shelf are textures, and a window
 * can sit over the desktop art. So the text in a region is made transparent,
 * the region is screenshotted, and each text element's own colour is compared
 * with the median pixel behind its box. WCAG 2 AA: 4.5:1, or 3:1 for large
 * text (24px, or 18.66px bold).
 */
import { inflateSync } from 'node:zlib';

/* Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced — what Chromium writes. */
export function decodePng(buf) {
    let pos = 8;
    let width = 0, height = 0, type = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG');
            type = data[9];
        } else if (kind === 'IDAT') idat.push(data);
        else if (kind === 'IEND') break;
        pos += 12 + len;
    }
    const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
    if (!bpp) throw new Error(`unsupported PNG colour type ${type}`);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * bpp;
    const out = Buffer.alloc(width * height * 3);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? line[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let v = line[x];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            line[x] = v & 255;
        }
        for (let x = 0; x < width; x++) {
            out[(y * width + x) * 3] = line[x * bpp];
            out[(y * width + x) * 3 + 1] = line[x * bpp + 1];
            out[(y * width + x) * 3 + 2] = line[x * bpp + 2];
        }
        prev = line;
    }
    return { width, height, rgb: out };
}

export const luminance = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const ratioOf = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Every visible text element under `rootSelector` (or the ones matching
 * `only`), with its measured ratio. `page` is a Playwright page.
 */
export async function measureContrast(page, rootSelector, { only = null } = {}) {
    const items = await page.evaluate(({ rootSelector, only }) => {
        const root = document.querySelector(rootSelector);
        if (!root) return [];
        // Measure the resting state: a sheet or a toast mid-fade is not a
        // colour the design chose. Cleared again after the screenshot.
        const still = document.createElement('style');
        still.id = 'contrast-probe-still';
        still.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
        document.head.appendChild(still);
        const els = new Set();
        if (only) root.querySelectorAll(only).forEach((el) => els.add(el));
        else {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) if (walker.currentNode.textContent.trim()) els.add(walker.currentNode.parentElement);
        }
        const out = [];
        let i = 0;
        for (const el of els) {
            // What of the box is actually on screen: clipped by every
            // scrolling or overflow-hidden ancestor, and by the viewport.
            const b = el.getBoundingClientRect();
            let [l, t, rr, bb] = [b.left, b.top, b.right, b.bottom];
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                const o = getComputedStyle(n);
                if (o.overflowX !== 'visible' || o.overflowY !== 'visible') {
                    const c = n.getBoundingClientRect();
                    l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); bb = Math.min(bb, c.bottom);
                }
            }
            l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, innerWidth); bb = Math.min(bb, innerHeight);
            const r = { left: l, top: t, width: rr - l, height: bb - t, right: rr, bottom: bb };
            const cs = getComputedStyle(el);
            if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
            if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
            if (el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"]')) continue;
            // Effective opacity up the tree: a faded control is faded text.
            let alpha = 1;
            for (let n = el; n && n.nodeType === 1; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
            const m = cs.color.match(/rgba?\(([^)]+)\)/);
            const parts = m ? m[1].split(',').map(Number) : [0, 0, 0, 1];
            const size = parseFloat(cs.fontSize);
            const bold = parseInt(cs.fontWeight, 10) >= 700;
            el.dataset.contrastProbe = String(i++);
            out.push({
                key: el.dataset.contrastProbe,
                text: (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent).trim().slice(0, 48),
                sel: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`,
                color: parts.slice(0, 3), alpha: (parts[3] ?? 1) * alpha,
                rect: { x: r.left, y: r.top, w: r.width, h: r.height },
                large: size >= 24 || (bold && size >= 18.66),
            });
        }
        const style = document.createElement('style');
        style.id = 'contrast-probe-style';
        style.textContent = `${rootSelector}, ${rootSelector} * { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; -webkit-text-fill-color: transparent !important; }
            ${rootSelector} img, ${rootSelector} svg, ${rootSelector} canvas, ${rootSelector} video { visibility: hidden !important; }
            .crt-overlay, .screen-pulse, .achievement-toast, .achievement-overflow, .document-notification, .adversary-bark, .floating-number, .click-particle { display: none !important; }`;
        document.head.appendChild(style);
        return out;
    }, { rootSelector, only });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const shot = decodePng(await page.screenshot({ animations: 'disabled' }));
    await page.evaluate(() => {
        document.getElementById('contrast-probe-style')?.remove();
        document.getElementById('contrast-probe-still')?.remove();
        document.querySelectorAll('[data-contrast-probe]').forEach((el) => el.removeAttribute('data-contrast-probe'));
    });
    const dpr = shot.width / (await page.evaluate(() => innerWidth));
    return items.map((it) => {
        const px = [];
        const x0 = Math.floor(it.rect.x * dpr), y0 = Math.floor(it.rect.y * dpr);
        const x1 = Math.min(shot.width, Math.ceil((it.rect.x + it.rect.w) * dpr)), y1 = Math.min(shot.height, Math.ceil((it.rect.y + it.rect.h) * dpr));
        const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
        for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
            const o = (y * shot.width + x) * 3;
            px.push([shot.rgb[o], shot.rgb[o + 1], shot.rgb[o + 2]]);
        }
        px.sort((a, b) => luminance(a) - luminance(b));
        const bg = px.length ? px[Math.floor(px.length / 2)] : [255, 255, 255];
        const fg = it.color.map((c, k) => c * it.alpha + bg[k] * (1 - it.alpha));
        const ratio = ratioOf(fg, bg);
        return { ...it, bg, ratio: Math.round(ratio * 100) / 100, need: it.large ? 3 : 4.5 };
    });
}
