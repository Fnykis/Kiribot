import { describe, it, expect, beforeEach } from 'vitest';
import { renderLanding, NOT_MEMBER_TEXT, NO_GROUPS_TEXT } from '../src/landing.js';

let root;
beforeEach(() => { root = document.createElement('div'); });

describe('renderLanding', () => {
    it('shows a login button when anonymous', () => {
        renderLanding(root, { kind: 'anonymous' });
        const btn = root.querySelector('#login-btn');
        expect(btn).not.toBeNull();
        expect(btn.textContent).toBe('Logga in med Discord');
        expect(root.querySelector('#logout-btn')).toBeNull();
    });

    it('shows the non-member text and only a logout button', () => {
        renderLanding(root, { kind: 'not_member' });
        expect(root.textContent).toContain(NOT_MEMBER_TEXT);
        expect(root.querySelector('#logout-btn')).not.toBeNull();
        expect(root.querySelectorAll('a.group-link').length).toBe(0);
    });

    it('uses the exact non-member wording', () => {
        expect(NOT_MEMBER_TEXT).toBe('Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.');
    });

    it('shows the join-a-group text when the member has no groups', () => {
        renderLanding(root, { kind: 'no_groups', displayName: 'Olle L' });
        expect(root.textContent).toContain(NO_GROUPS_TEXT);
        expect(root.querySelector('#logout-btn')).not.toBeNull();
        expect(root.querySelectorAll('a.group-link').length).toBe(0);
    });

    it('uses the exact no-groups wording', () => {
        expect(NO_GROUPS_TEXT).toBe('Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du nyligen ändrat din profil? Vänta då i några minuter och prova igen.');
    });

    it('lists every group as a link to that wheel', () => {
        renderLanding(root, {
            kind: 'ok',
            displayName: 'Olle L',
            instruments: [{ id: 'i1', name: 'tarol' }],
            workgroups: [{ id: 'w1', name: 'transportgruppen' }, { id: 'w2', name: 'fikagruppen' }]
        });
        const links = [...root.querySelectorAll('a.group-link')];
        expect(links.length).toBe(3);
        expect(links.map(a => a.textContent)).toEqual(['tarol', 'transportgruppen', 'fikagruppen']);
        expect(links[0].getAttribute('href')).toBe('wheel.html?role=i1');
        expect(links[2].getAttribute('href')).toBe('wheel.html?role=w2');
    });

    it('omits the instrument heading when the member has no instruments', () => {
        renderLanding(root, { kind: 'ok', displayName: 'O', instruments: [], workgroups: [{ id: 'w1', name: 'a' }] });
        expect(root.textContent).not.toContain('Instrument');
        expect(root.textContent).toContain('Arbetsgrupper');
    });

    it('escapes group names rather than injecting HTML', () => {
        renderLanding(root, { kind: 'ok', displayName: 'O', instruments: [], workgroups: [{ id: 'w1', name: '<img src=x onerror=alert(1)>' }] });
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('a.group-link').textContent).toBe('<img src=x onerror=alert(1)>');
    });
});

import { renderLanding, toState, MOD_SECTION_TEXT, MOD_LOAD_ERROR_TEXT } from '../src/landing.js';

describe('the Mod section', () => {
    const OK_MOD = {
        kind: 'ok', displayName: 'Mod', isModerator: true,
        instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
    };

    it('uses the exact heading wording', () => {
        expect(MOD_SECTION_TEXT).toBe('Mod — alla gruppers årshjul');
        expect(MOD_LOAD_ERROR_TEXT).toBe('Kunde inte hämta grupplistan.');
    });

    it('is absent for an ordinary member', () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Olle L', isModerator: false,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        expect(root.querySelector('.mod-section')).toBeNull();
    });

    it('is present and closed for a moderator', () => {
        renderLanding(root, OK_MOD);
        const details = root.querySelector('details.mod-section');
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        expect(details.querySelector('summary').textContent).toBe(MOD_SECTION_TEXT);
    });

    it('renders no group links until it is filled', () => {
        renderLanding(root, OK_MOD);
        expect(root.querySelectorAll('.mod-section a.group-link').length).toBe(0);
    });

    it('shows a moderator with no groups both the no-groups text and the section', () => {
        renderLanding(root, { kind: 'no_groups', displayName: 'Mod', isModerator: true });
        expect(root.textContent).toContain(NO_GROUPS_TEXT);
        expect(root.querySelector('details.mod-section')).not.toBeNull();
    });

    it('toState carries isModerator through', () => {
        expect(toState({ member: true, displayName: 'M', isModerator: true, instruments: [], workgroups: [] }).isModerator).toBe(true);
        expect(toState({ member: true, displayName: 'O', isModerator: false, instruments: [{ id: 'i1', name: 'tarol' }], workgroups: [] }).isModerator).toBe(false);
    });
});

describe('fillModSection', () => {
    it('lists every instrument and workgroup as a wheel link', async () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Mod', isModerator: true,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        const { fillModSection } = await import('../src/landing.js');
        await fillModSection(root.querySelector('details.mod-section'), async () => ({
            instruments: [{ id: 'i1', name: 'tarol' }],
            workgroups: [{ id: 'w1', name: 'transportgruppen' }]
        }));
        const links = [...root.querySelectorAll('.mod-section a.group-link')];
        expect(links.map(a => a.textContent)).toEqual(['tarol', 'transportgruppen']);
        expect(links[1].getAttribute('href')).toBe('wheel.html?role=w1');
    });

    it('fetches only once even if opened repeatedly', async () => {
        renderLanding(root, { kind: 'ok', displayName: 'Mod', isModerator: true, instruments: [], workgroups: [] });
        const { fillModSection } = await import('../src/landing.js');
        let calls = 0;
        const load = async () => { calls++; return { instruments: [], workgroups: [] }; };
        const details = root.querySelector('details.mod-section');
        await fillModSection(details, load);
        await fillModSection(details, load);
        expect(calls).toBe(1);
    });

    it('renders its error inside the section and leaves the rest of the page intact', async () => {
        renderLanding(root, {
            kind: 'ok', displayName: 'Mod', isModerator: true,
            instruments: [{ id: 'i1', name: 'tarol' }], workgroups: []
        });
        const { fillModSection } = await import('../src/landing.js');
        await fillModSection(root.querySelector('details.mod-section'), async () => { throw new Error('nope'); });
        expect(root.querySelector('.mod-section').textContent).toContain(MOD_LOAD_ERROR_TEXT);
        // The caller's own group link is untouched.
        expect(root.querySelector('.group-section a.group-link').textContent).toBe('tarol');
    });
});
