// Line icons on a 24x24 grid, 2px stroke, drawn in currentColor so every icon inherits the
// colour of the control it sits in. Built as DOM nodes rather than innerHTML strings: the
// pages render user-entered titles, and keeping one single node-building path means markup
// can never be parsed out of data.
const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
    back: ['M15 18l-6-6 6-6'],
    forward: ['M9 18l6-6-6-6'],
    expand: ['M6 9.5l6 6 6-6'],
    edit: ['M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z', 'M13.5 6.5l4 4'],
    remove: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7', 'M9.5 7V4.5h5V7'],
    plus: ['M12 5v14', 'M5 12h14'],
    calendar: ['M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5z', 'M8 3.5V7', 'M16 3.5V7', 'M4 11.5h16'],
    warning: ['M12 4.5 3 20h18z', 'M12 10.5v4', 'M12 17.4v.1'],
    shield: ['M12 3.5l7 2.8v5.2c0 4.1-2.9 7.3-7 9-4.1-1.7-7-4.9-7-9V6.3z'],
    logout: ['M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5', 'M16 16l4-4-4-4', 'M20 12H9'],
    check: ['M20 6.5 9.5 17 4 11.5'],
    close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
};

export function icon(name, className = 'icon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    // Decorative throughout: every icon here sits next to a text label or on a control that
    // carries its own aria-label, so announcing the graphic would only duplicate that name.
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);

    for (const d of PATHS[name] ?? []) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    }
    return svg;
}
