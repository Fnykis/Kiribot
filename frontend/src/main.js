import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { Bug } from 'lucide';
import { installDebugOverlay, toggleDebugOverlay } from './debugOverlay.js';
import { bootSdk, authenticateSdk } from './sdk.js';

installDebugOverlay();

function mountDebugButton() {
    const btn = document.getElementById('debug-btn');
    if (!btn || btn._mounted) return;
    btn._mounted = true;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const [tag, attrs] of Bug) {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        svg.appendChild(el);
    }
    btn.appendChild(svg);
    btn.onclick = () => toggleDebugOverlay();
}
import { exchangeCode, setToken, getToken } from './auth.js';
import {
    isDevMode,
    fetchConcerts,
    fetchState,
    fetchMembers,
    placeMember,
    moveMember,
    removeMember,
    setMestre,
    setMute,
    leaveVoice,
    shareLineupImage,
} from './dataSource.js';
import { createVoiceControls } from './voiceControls.js';
import {
    setEvent,
    getEvent,
    clearSelectedIds,
    clearSelectedGhostIds,
    setConcerts,
    getConcerts,
    setSelectedConcertId,
    clearSelectedConcert,
    getDraggingId,
    setDraggingId,
    getDraggingPosition,
    setDraggingPosition,
    getDraggingSidebarUserId,
    setDraggingSidebarUserId,
    getIsSelecting,
    toggleMestre,
    setMestrePos,
    getMestres,
    hydrateMestresFromLineup,
} from './state.js';
import { toCanvas } from 'html-to-image';

let _cachedFontCSS = null;
async function buildFontEmbedCSS() {
    if (_cachedFontCSS !== null) return _cachedFontCSS;
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(l => /fonts\.googleapis\.com/.test(l.href));
    const urlToDataUrl = async (url) => {
        const blob = await fetch(url, { credentials: 'omit' }).then(r => r.blob());
        return await new Promise(res => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
        });
    };
    let combined = '';
    for (const link of links) {
        try {
            const css = await fetch(link.href, { credentials: 'omit' }).then(r => r.text());
            const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m => m[1]))];
            let inlined = css;
            for (const url of urls) {
                try {
                    const dataUrl = await urlToDataUrl(url);
                    inlined = inlined.split(url).join(dataUrl);
                } catch (e) { console.warn('font url fetch failed', url, e); }
            }
            combined += inlined + '\n';
        } catch (e) { console.warn('font css fetch failed', link.href, e); }
    }
    _cachedFontCSS = combined;
    return combined;
}

function computeDotsBBox(stageEl) {
    const stageRect = stageEl.getBoundingClientRect();
    const dots = stageEl.querySelectorAll('.stage-dot');
    if (!dots.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const accumulate = (r) => {
        const left = r.left - stageRect.left;
        const top = r.top - stageRect.top;
        const right = r.right - stageRect.left;
        const bottom = r.bottom - stageRect.top;
        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
    };
    for (const d of dots) {
        accumulate(d.getBoundingClientRect());
        const label = d.querySelector('.dot-label');
        if (label) accumulate(label.getBoundingClientRect());
        const inst = d.querySelector('.dot-instrument');
        if (inst) accumulate(inst.getBoundingClientRect());
    }
    // Mestre (hand) ghosts + their connector lines live outside .stage-dot
    for (const ghost of stageEl.querySelectorAll('.mestre-ghost')) {
        accumulate(ghost.getBoundingClientRect());
    }
    for (const line of stageEl.querySelectorAll('.mestre-line')) {
        accumulate(line.getBoundingClientRect());
    }
    return { minX, minY, maxX, maxY, stageW: stageRect.width, stageH: stageRect.height };
}

function wrapTextLines(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const trial = cur ? cur + ' ' + w : w;
        if (ctx.measureText(trial).width <= maxWidth) cur = trial;
        else {
            if (cur) lines.push(cur);
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

function drawWatermark(ctx, text, w, h, pr, baseFontPx) {
    if (!text) return 0;
    const padX = 16 * pr;
    const padBottom = 14 * pr;
    const maxW = w - 2 * padX;
    const maxLines = 3;
    // Title sits a touch above the dot-label size so it reads as a heading,
    // but scales with the dots (baseFontPx already includes pixelRatio).
    let fontSize = baseFontPx * 1;
    const minFont = baseFontPx;
    let lines = [];
    while (fontSize >= minFont) {
        ctx.font = `600 ${fontSize}px Poppins, system-ui, sans-serif`;
        lines = wrapTextLines(ctx, text, maxW);
        if (lines.length <= maxLines) break;
        fontSize -= 2 * pr;
    }
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const last = lines[maxLines - 1];
        let trimmed = last;
        while (trimmed.length > 1 && ctx.measureText(trimmed + '…').width > maxW) {
            trimmed = trimmed.slice(0, -1);
        }
        lines[maxLines - 1] = trimmed + '…';
    }
    const lineH = fontSize * 1.2;
    const textH = lineH * lines.length;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 6 * pr;
    ctx.shadowOffsetY = 1 * pr;
    let y = h - padBottom;
    for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], padX, y);
        y -= lineH;
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    return textH + padBottom;
}

async function captureCroppedLineup(stageEl, titleText, fontEmbedCSS) {
    const pixelRatio = 2;
    const fullCanvas = await toCanvas(stageEl, { pixelRatio, cacheBust: true, fontEmbedCSS, skipFonts: true });
    const bbox = computeDotsBBox(stageEl);
    if (!bbox) throw new Error('Inga prickar att exportera');

    const padX = 40, padTop = 40, padBottom = 60;
    const cssLeft = Math.max(0, bbox.minX - padX);
    const cssTop = Math.max(0, bbox.minY - padTop);
    const cssRight = Math.min(bbox.stageW, bbox.maxX + padX);
    const cssBottom = Math.min(bbox.stageH, bbox.maxY + padBottom);
    const cssW = Math.max(1, cssRight - cssLeft);
    const cssH = Math.max(1, cssBottom - cssTop);

    const sx = cssLeft * pixelRatio;
    const sy = cssTop * pixelRatio;
    const sw = cssW * pixelRatio;
    const sh = cssH * pixelRatio;

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext('2d');
    const bg = getComputedStyle(stageEl).backgroundColor;
    ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#0f0f14';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    // Match the dot labels: read their actual rendered size (1.2cqw resolves
    // to px here) so the watermark scales with the dots instead of being fixed.
    const sampleLabel = stageEl.querySelector('.dot-label');
    const labelCssPx = sampleLabel ? parseFloat(getComputedStyle(sampleLabel).fontSize) : 12;
    const baseFontPx = labelCssPx * pixelRatio;
    drawWatermark(ctx, titleText, sw, sh, pixelRatio, baseFontPx);

    return await new Promise((resolve, reject) => {
        out.toBlob(b => b ? resolve(b) : reject(new Error('Tom bild')), 'image/png');
    });
}

import { renderPicker } from './picker.js';
import { renderAvailable } from './sidebar/available.js';
import { renderStage, GRID_STEP, STAGE_W, STAGE_H } from './canvas/stage.js';
import { startPoll, stopPoll } from './poll.js';
import { wireDrag, applySelectionVisual } from './canvas/drag.js';
import { openManualAdd } from './sidebar/manualAdd.js';
import { openStallUppAlla } from './sidebar/stallUppAlla.js';
import { computeAutoPositions } from './canvas/autoPlace.js';
import { applyResponsiveLayout, mobileMQ, isMobile } from './responsive.js';
import { clearViewportTransform } from './canvas/viewport.js';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

let _accessToken = null;
let _pollHandle = null;
let _sdk = null;
let _userId = null;
const _activeVoiceControls = new Set();

function mountVoiceControls(root) {
    if (!root || !_sdk || !_userId) return null;
    for (const h of [..._activeVoiceControls]) h.destroy();
    const handle = createVoiceControls({
        root,
        sdk: _sdk,
        userId: _userId,
        setMute,
        leaveVoice,
        getToken,
    });
    _activeVoiceControls.add(handle);
    const origDestroy = handle.destroy;
    handle.destroy = () => { origDestroy(); _activeVoiceControls.delete(handle); };
    return handle;
}

function showStatus(message, isError = false, detail) {
    const overlay = document.getElementById('debug-overlay');
    document.body.replaceChildren();
    if (overlay) document.body.appendChild(overlay);

    const wrap = document.createElement('div');
    wrap.className = 'status-wrap';

    const p = document.createElement('p');
    p.className = isError ? 'status-message error' : 'status-message';
    p.textContent = message;
    wrap.appendChild(p);

    if (detail) {
        const pre = document.createElement('pre');
        pre.className = 'status-detail';
        pre.textContent = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
        wrap.appendChild(pre);
    }

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'status-btn';
    reload.textContent = 'Tillbaka till konsertlistan';
    reload.onclick = () => location.reload();
    wrap.appendChild(reload);

    document.body.appendChild(wrap);
}

function formatErrDetail(err) {
    if (!err) return null;
    const lines = [];
    if (err.name) lines.push(`name: ${err.name}`);
    if (err.status != null) lines.push(`status: ${err.status}`);
    if (err.message) lines.push(`message: ${err.message}`);
    if (err.stack) lines.push(`stack:\n${err.stack}`);
    return lines.length ? lines.join('\n') : String(err);
}

function showTransientError(message) {
    const existing = document.getElementById('transient-error');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'transient-error';
    div.className = 'transient-error';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => { div.classList.add('fade'); }, 50);
    setTimeout(() => { div.remove(); }, 6000);
}

function openConfirm(modalEl, { message, confirmLabel = 'Bekräfta', cancelLabel = 'Avbryt', onConfirm }) {
    modalEl.replaceChildren();
    modalEl.style.display = 'flex';
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'confirm-btn';
    cancel.textContent = cancelLabel;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirm-btn danger';
    confirm.textContent = confirmLabel;
    const close = () => { modalEl.style.display = 'none'; modalEl.replaceChildren(); };
    cancel.onclick = close;
    confirm.onclick = async () => { close(); if (onConfirm) await onConfirm(); };
    modalEl.onclick = (e) => { if (e.target === modalEl) close(); };
    actions.append(cancel, confirm);
    box.append(msg, actions);
    modalEl.appendChild(box);
}

function openShareConfirm(modalEl, { message, onConfirm }) {
    modalEl.replaceChildren();
    modalEl.style.display = 'flex';
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const nej = document.createElement('button');
    nej.type = 'button';
    nej.className = 'confirm-btn';
    nej.textContent = 'Nej';
    const ja = document.createElement('button');
    ja.type = 'button';
    ja.className = 'confirm-btn primary';
    ja.textContent = 'Ja';

    const close = () => {
        modalEl.style.display = 'none';
        modalEl.replaceChildren();
        document.removeEventListener('keydown', onKey, true);
    };
    const confirm = async () => { close(); if (onConfirm) await onConfirm(); };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };

    nej.onclick = close;
    ja.onclick = confirm;
    modalEl.onclick = (e) => { if (e.target === modalEl) close(); };
    document.addEventListener('keydown', onKey, true);

    actions.append(nej, ja);
    box.append(msg, actions);
    modalEl.appendChild(box);
    ja.focus();
}

function hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}
function showEl(id, display = 'block') {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

async function fetchAndShowPicker() {
    let concerts;
    try {
        concerts = await fetchConcerts(_accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else {
            showStatus('Kunde inte hämta konserter. Ladda om sidan.', true);
        }
        return;
    }
    setConcerts(concerts);

    hideEl('loading');
    hideEl('app');
    showEl('picker');

    renderPicker(
        document.getElementById('picker'),
        concerts,
        (concertId) => loadPlanner(concertId),
    );
    mountVoiceControls(document.getElementById('picker-voice-slot'));
}

async function refreshState(concertId, sidebarInner, stage) {
    try {
        const fresh = await fetchState(concertId, _accessToken);
        setEvent(fresh);
        hydrateMestresFromLineup(fresh.lineup);
        renderAvailable(sidebarInner, fresh);
        renderStage(stage, fresh);
        applySelectionVisual(stage);
    } catch (err) {
        console.warn('refresh failed', err);
    }
}

async function loadPlanner(concertId) {
    let event;
    try {
        event = await fetchState(concertId, _accessToken);
    } catch (err) {
        if (err.status === 403) {
            showStatus('Åtkomst nekad. Harmonian-rollen krävs.', true);
        } else if (err.status === 404) {
            showStatus('Konserten är stängd eller hittades inte.');
        } else {
            showStatus('Kunde inte ladda evenemanget. Ladda om sidan.', true);
        }
        return;
    }

    setSelectedConcertId(concertId);
    setEvent(event);
    hydrateMestresFromLineup(event.lineup);

    const concertMeta = (getConcerts() || []).find(c => c.concertId === concertId);
    const title = document.getElementById('planner-title');
    if (title) title.textContent = concertMeta ? `${concertMeta.name.replace(/\[.*?\]\s*/g, '').replace(/^[^a-zA-ZåäöÅÄÖ0-9]+/, '').trim()} — ${concertMeta.date}` : '';

    hideEl('picker');
    showEl('app', 'flex');
    mountDebugButton();

    const sidebar = document.getElementById('sidebar');
    const sidebarInner = document.getElementById('sidebar-inner');
    const stage = document.getElementById('stage');

    renderAvailable(sidebarInner, event);
    renderStage(stage, event);

    const voiceSlot = document.getElementById('sidebar-voice-slot');
    if (voiceSlot) {
        voiceSlot.replaceChildren();
        mountVoiceControls(voiceSlot);
    }

    wireDrag({
        stageEl: stage,
        sidebarEl: sidebar,
        sidebarContentEl: sidebarInner,
        getEvent,
        setDraggingId,
        setDraggingPosition,
        setDraggingSidebarUserId,
        onPlace: async (payload) => {
            const updated = await placeMember({ concertId, ...payload }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
        },
        onMove: async ({ userId, x, y }) => {
            const updated = await moveMember({ concertId, userId, x, y }, _accessToken);
            setEvent(updated);
            renderStage(stage, updated);
        },
        onMoveMany: async (moves) => {
            let updated;
            for (const { userId, x, y } of moves) {
                updated = await moveMember({ concertId, userId, x, y }, _accessToken);
                setEvent(updated);
            }
            if (updated) renderStage(stage, updated);
        },
        renderLocal: () => renderStage(stage, getEvent()),
        onMestre: async ({ userId }) => {
            const entry = (getEvent().lineup || []).find(e => String(e.userId) === String(userId));
            if (!entry) return;
            const wasOn = getMestres().has(String(userId));
            const initX = entry.position.x;
            const initY = Math.min(STAGE_H - GRID_STEP, entry.position.y + GRID_STEP * 3);
            // Optimistic local toggle for instant feedback, then persist (set or clear).
            toggleMestre(userId, { x: initX, y: initY });
            renderStage(stage, getEvent());
            try {
                const body = wasOn
                    ? { concertId, userId, x: null, y: null }
                    : { concertId, userId, x: initX, y: initY };
                const updated = await setMestre(body, _accessToken);
                setEvent(updated);
            } catch (err) {
                // Roll back the optimistic toggle on failure.
                toggleMestre(userId, { x: initX, y: initY });
                renderStage(stage, getEvent());
                showTransientError('Kunde inte spara mestre');
            }
        },
        onMestreMove: async ({ userId, x, y }) => {
            setMestrePos(userId, { x, y });
            try {
                const updated = await setMestre({ concertId, userId, x, y }, _accessToken);
                setEvent(updated);
            } catch (err) {
                showTransientError('Kunde inte spara mestre-position');
            }
        },
        onRemove: async ({ userId }) => {
            const updated = await removeMember({ concertId, userId }, _accessToken);
            setEvent(updated);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
        },
        onError: (err) => {
            if (err.status === 409) {
                refreshState(concertId, sidebarInner, stage);
            } else {
                showStatus('Något gick fel: ' + (err.message || err), true);
            }
        }
    });

    const manualBtn = document.getElementById('manual-add-btn');
    const modalEl = document.getElementById('manual-add-modal');
    if (manualBtn && modalEl) {
        manualBtn.onclick = () => openManualAdd({
            modalEl,
            fetchMembers: (q) => fetchMembers(q, _accessToken),
            instruments: Object.keys(event.signups || {}),
            onSubmit: async ({ userId, displayName, instrument }) => {
                try {
                    const updated = await placeMember(
                        { concertId, userId, displayName, instrument, x: 500, y: 300, manuallyAdded: true },
                        _accessToken);
                    setEvent(updated);
                    renderAvailable(sidebarInner, updated);
                    renderStage(stage, updated);
                } catch (err) {
                    showStatus('Kunde inte lägga till medlem: ' + (err.message || err), true);
                }
            }
        });
    }

    const stuaBtn = document.getElementById('stall-upp-alla-btn');
    const stuaModal = document.getElementById('stall-upp-alla-modal');
    if (stuaBtn && stuaModal) {
        stuaBtn.onclick = () => openStallUppAlla({
            modalEl: stuaModal,
            event: getEvent(),
            onSubmit: async (selections) => {
                if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
                const positioned = computeAutoPositions(selections, GRID_STEP, STAGE_W, STAGE_H);
                for (const p of positioned) {
                    try {
                        const updated = await placeMember({
                            concertId, ...p, manuallyAdded: false
                        }, _accessToken);
                        setEvent(updated);
                    } catch (err) {
                        showStatus(`Kunde inte placera ${p.displayName}: ${err.message || err}`, true);
                        break;
                    }
                }
                renderAvailable(sidebarInner, getEvent());
                renderStage(stage, getEvent());
                _pollHandle = startPoll({
                    fetchState: () => fetchState(concertId, _accessToken),
                    intervalMs: 5000,
                    getDraggingId,
                    getDraggingPosition,
                    getDraggingSidebarUserId,
                    getIsSelecting,
                    onUpdate: (u) => { setEvent(u); renderAvailable(sidebarInner, u); renderStage(stage, u); applySelectionVisual(stage); },
                    onError: (err) => { console.warn('poll', err); }
                });
            }
        });
    }

    const rensaBtn = document.getElementById('rensa-btn');
    const rensaModal = document.getElementById('rensa-modal');
    if (rensaBtn && rensaModal) {
        rensaBtn.onclick = () => openConfirm(rensaModal, {
            message: 'Är du säker? Detta kommer rensa hela uppställningen.',
            confirmLabel: 'Rensa',
            onConfirm: async () => {
                const lineup = (getEvent().lineup || []).slice();
                for (const entry of lineup) {
                    try {
                        const updated = await removeMember({ concertId, userId: entry.userId }, _accessToken);
                        setEvent(updated);
                    } catch (err) {
                        showStatus('Kunde inte rensa: ' + (err.message || err), true);
                        return;
                    }
                }
                renderAvailable(sidebarInner, getEvent());
                renderStage(stage, getEvent());
            }
        });
    }

    const cameraBtn = document.getElementById('camera-btn');
    const shareModal = document.getElementById('share-modal');
    if (cameraBtn && shareModal) {
        cameraBtn.onclick = async () => {
            clearSelectedIds();
            clearSelectedGhostIds();
            renderStage(stage, getEvent());
            stage.classList.add('no-grid');
            const titleEl = document.getElementById('planner-title');
            const titleText = titleEl ? titleEl.textContent : '';

            let blob;
            try {
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                const fontEmbedCSS = await buildFontEmbedCSS();
                blob = await captureCroppedLineup(stage, titleText, fontEmbedCSS);
            } catch (err) {
                console.warn('render image failed', err);
                showTransientError('Kunde inte rendera bilden: ' + (err.message || err));
                stage.classList.remove('no-grid');
                return;
            } finally {
                stage.classList.remove('no-grid');
            }

            const flashAndToast = () => {
                cameraBtn.classList.add('flash');
                setTimeout(() => cameraBtn.classList.remove('flash'), 400);
                const toast = document.getElementById('camera-toast');
                if (toast) {
                    toast.classList.add('show');
                    clearTimeout(toast._hideTimer);
                    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2000);
                }
            };

            if (isDevMode) {
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    flashAndToast();
                } catch (err) {
                    console.warn('dev clipboard write failed', err);
                    showTransientError('Klippbord misslyckades: ' + (err.message || err));
                }
                return;
            }

            openShareConfirm(shareModal, {
                message: 'Vill du skicka den här uppställningen som bild till Harmonia-kanalen?',
                onConfirm: async () => {
                    try {
                        await shareLineupImage(blob, concertId, _accessToken);
                        flashAndToast();
                    } catch (err) {
                        console.warn('share image failed', err && err.name, err && err.status, err && err.message, err && err.body, err);
                        const detail = err && (err.status ? `${err.status} ${err.message || ''}` : (err.message || String(err)));
                        showTransientError('Kunde inte skicka bilden: ' + detail);
                    }
                }
            });
        };
    }

    if (_pollHandle) stopPoll(_pollHandle);
    _pollHandle = startPoll({
        fetchState: () => fetchState(concertId, _accessToken),
        intervalMs: 5000,
        getDraggingId,
        getDraggingPosition,
        getDraggingSidebarUserId,
        onUpdate: (updated) => {
            setEvent(updated);
            hydrateMestresFromLineup(updated.lineup);
            renderAvailable(sidebarInner, updated);
            renderStage(stage, updated);
            applySelectionVisual(stage);
        },
        onError: (err) => { console.warn('poll', err); }
    });
}

function backToPicker() {
    if (_pollHandle) { stopPoll(_pollHandle); _pollHandle = null; }
    clearSelectedConcert();
    fetchAndShowPicker();
}

async function boot() {
    if (isDevMode) {
        _accessToken = 'dev';
        setToken(_accessToken);
        _sdk = { subscribe: () => () => {} };
        _userId = 'dev';
    } else {
        let sdk, code;
        try {
            ({ sdk, code } = await bootSdk(DiscordSDK, CLIENT_ID, patchUrlMappings));
        } catch {
            return; // sdk.js already rendered standalone refusal
        }

        try {
            const result = await exchangeCode(code);
            _accessToken = result.access_token;
            setToken(_accessToken);
            const authResult = await authenticateSdk(sdk, _accessToken);
            _sdk = sdk;
            _userId = authResult.user.id;
        } catch (err) {
            const host = window.location.host;
            const fetchPatched = window.fetch.toString().indexOf('[native code]') === -1 ? 'PATCHED' : 'NATIVE';
            showStatus(
                'Auth fail [' + (err.status || 'no-status') + ']: ' + (err.message || String(err))
                + ' | code: ' + (code ? code.slice(0, 12) : 'EMPTY')
                + ' | host: ' + host
                + ' | fetch: ' + fetchPatched,
                true,
            );
            return;
        }
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', backToPicker);

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarEl = document.getElementById('sidebar');
    const scrim = document.getElementById('drawer-scrim');

    function openDrawer()  { sidebarEl.classList.add('open');    if (scrim) scrim.classList.add('show'); }
    function closeDrawer() { sidebarEl.classList.remove('open'); if (scrim) scrim.classList.remove('show'); }

    if (sidebarToggleBtn && sidebarEl) {
        sidebarToggleBtn.addEventListener('click', () => {
            if (isMobile()) {
                sidebarEl.classList.contains('open') ? closeDrawer() : openDrawer();
            } else {
                sidebarEl.classList.toggle('collapsed'); // desktop behavior unchanged
            }
        });
    }
    if (scrim) scrim.addEventListener('click', closeDrawer);

    // Overflow popover (mobile only).
    const overflowBtn = document.getElementById('overflow-btn');
    const overflowMenu = document.getElementById('overflow-menu');
    if (overflowBtn && overflowMenu) {
        overflowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            overflowMenu.classList.toggle('open');
        });
        // Close the popover after choosing an action, or when tapping outside.
        overflowMenu.addEventListener('click', () => overflowMenu.classList.remove('open'));
        document.addEventListener('click', (e) => {
            if (!overflowMenu.contains(e.target) && e.target !== overflowBtn) {
                overflowMenu.classList.remove('open');
            }
        });
    }

    // Place buttons for the current breakpoint, and re-place on breakpoint change.
    applyResponsiveLayout();
    mobileMQ.addEventListener('change', () => {
        applyResponsiveLayout();
        closeDrawer();
        // Drop any stale pan/zoom transform when crossing the breakpoint
        // (desktop must never carry a transform; mobile re-fits on next gesture).
        const stageEl = document.getElementById('stage');
        if (stageEl) clearViewportTransform(stageEl);
    });

    await fetchAndShowPicker();
}

boot();
