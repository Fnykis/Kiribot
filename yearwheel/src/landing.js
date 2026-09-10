import { apiGet, apiPost } from './api.js';
import { buildAuthorizeUrl, newState } from './auth.js';

export const NOT_MEMBER_TEXT = 'Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.';
export const NO_GROUPS_TEXT = 'Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du nyligen ändrat din profil? Vänta då i några minuter och prova igen.';
export const LOAD_ERROR_TEXT = 'Kunde inte ladda sidan. Försök igen senare.';
export const MISSING_ROLE_NOTICE_TEXT = 'Du har inte längre tillgång till den gruppens årshjul.';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function groupSection(heading, groups) {
    const section = el('section', 'group-section');
    section.appendChild(el('h2', null, heading));
    const list = el('ul', 'group-list');
    for (const g of groups) {
        const li = el('li');
        const a = el('a', 'group-link', g.name);
        a.setAttribute('href', `wheel.html?role=${encodeURIComponent(g.id)}`);
        li.appendChild(a);
        list.appendChild(li);
    }
    section.appendChild(list);
    return section;
}

export const MOD_SECTION_TEXT = 'Mod — alla gruppers årshjul';
export const MOD_LOAD_ERROR_TEXT = 'Kunde inte hämta grupplistan.';

function modSection() {
    const details = el('details', 'mod-section');
    details.appendChild(el('summary', null, MOD_SECTION_TEXT));
    details.appendChild(el('div', 'mod-body'));
    return details;
}

// Fetches on first open, not on page load, so a moderator's ordinary visit costs what
// everyone else's does. Lists all groups, their own included.
export async function fillModSection(details, loadGroups) {
    if (!details || details.dataset.loaded === 'true') return;
    details.dataset.loaded = 'true';

    const body = details.querySelector('.mod-body');
    body.replaceChildren();

    let all;
    try {
        all = await loadGroups();
    } catch {
        details.dataset.loaded = 'false'; // allow a retry on the next open
        body.replaceChildren(el('p', 'notice', MOD_LOAD_ERROR_TEXT));
        return;
    }

    if (all.instruments.length) body.appendChild(groupSection('Instrument', all.instruments));
    if (all.workgroups.length) body.appendChild(groupSection('Arbetsgrupper', all.workgroups));
}

function logoutButton() {
    const btn = el('button', 'btn', 'Logga ut');
    btn.id = 'logout-btn';
    btn.type = 'button';
    return btn;
}

export function renderLanding(root, state, notice) {
    root.replaceChildren();
    root.appendChild(el('h1', null, 'Årshjul'));

    if (notice) root.appendChild(el('p', 'notice notice-transient', notice));

    if (state.kind === 'error') {
        root.appendChild(el('p', 'notice', LOAD_ERROR_TEXT));
        return;
    }

    if (state.kind === 'anonymous') {
        const btn = el('button', 'btn', 'Logga in med Discord');
        btn.id = 'login-btn';
        btn.type = 'button';
        root.appendChild(btn);
        return;
    }

    if (state.kind === 'not_member') {
        root.appendChild(el('p', 'notice', NOT_MEMBER_TEXT));
        root.appendChild(logoutButton());
        return;
    }

    if (state.kind === 'no_groups') {
        root.appendChild(el('p', 'notice', NO_GROUPS_TEXT));
        if (state.isModerator) root.appendChild(modSection());
        root.appendChild(logoutButton());
        return;
    }

    root.appendChild(el('p', 'greeting', state.displayName));
    if (state.instruments.length) root.appendChild(groupSection('Instrument', state.instruments));
    if (state.workgroups.length) root.appendChild(groupSection('Arbetsgrupper', state.workgroups));
    if (state.isModerator) root.appendChild(modSection());
    root.appendChild(logoutButton());
}

export function toState(me) {
    if (!me.member) return { kind: 'not_member' };
    const isModerator = me.isModerator === true;
    if (!me.instruments.length && !me.workgroups.length) {
        return { kind: 'no_groups', displayName: me.displayName, isModerator };
    }
    return {
        kind: 'ok',
        displayName: me.displayName,
        isModerator,
        instruments: me.instruments,
        workgroups: me.workgroups
    };
}

export async function initLanding(root, search = window.location.search) {
    const reason = new URLSearchParams(search).get('reason');
    const notice = reason === 'missing_role' ? MISSING_ROLE_NOTICE_TEXT : undefined;

    let state;
    try {
        state = toState(await apiGet('/api/web/me'));
    } catch (err) {
        if (err && err.status === 401) {
            state = { kind: 'anonymous' };
        } else {
            renderLanding(root, { kind: 'error' });
            return;
        }
    }
    renderLanding(root, state, notice);

    const mod = root.querySelector('details.mod-section');
    mod?.addEventListener('toggle', () => {
        if (mod.open) fillModSection(mod, () => apiGet('/api/web/groups'));
    });

    root.querySelector('#login-btn')?.addEventListener('click', () => {
        window.location.href = buildAuthorizeUrl({
            clientId: import.meta.env.VITE_DISCORD_CLIENT_ID,
            redirectUri: import.meta.env.VITE_REDIRECT_URI,
            state: newState(),
        });
    });

    root.querySelector('#logout-btn')?.addEventListener('click', async () => {
        await apiPost('/api/web/logout', {});
        window.location.reload();
    });
}
