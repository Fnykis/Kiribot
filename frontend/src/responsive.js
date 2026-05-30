// Responsive DOM placement: on mobile, relocate the header action buttons into
// the drawer action-row and the overflow popover; on desktop, restore the
// original header layout. Single DOM nodes — handlers bound by reference survive.

export const mobileMQ = window.matchMedia('(max-width: 767px)');
export function isMobile() { return mobileMQ.matches; }

function byId(id) { return document.getElementById(id); }

export function applyResponsiveLayout() {
    const headerLeft  = document.querySelector('.header-left');
    const headerRight = document.querySelector('.header-right');
    const drawerActions = byId('drawer-actions');
    const overflowMenu  = byId('overflow-menu');

    const back   = byId('back-btn');
    const toggle = byId('sidebar-toggle-btn');
    const rensa  = byId('rensa-btn');
    const debug  = byId('debug-btn');
    const stall  = byId('stall-upp-alla-btn');
    const manual = byId('manual-add-btn');
    const overflowBtn = byId('overflow-btn');

    if (!headerLeft || !headerRight || !drawerActions || !overflowMenu) return;

    if (isMobile()) {
        // Header-left keeps only the drawer toggle.
        if (toggle) headerLeft.appendChild(toggle);
        // Back / Rensa / Debug move into the drawer action-row (in this order).
        [back, rensa, debug].forEach(el => { if (el) drawerActions.appendChild(el); });
        // Placera alla / + Medlem move into the overflow popover.
        [stall, manual].forEach(el => { if (el) overflowMenu.appendChild(el); });
    } else {
        // Restore desktop header order: [back, toggle, rensa, debug] | [stall, manual, overflowBtn].
        [back, toggle, rensa, debug].forEach(el => { if (el) headerLeft.appendChild(el); });
        [stall, manual, overflowBtn].forEach(el => { if (el) headerRight.appendChild(el); });
    }
}
