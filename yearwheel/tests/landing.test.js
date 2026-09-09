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
