export function renderPicker(container, concerts, onSelect) {
    container.replaceChildren();

    const heading = document.createElement('h1');
    heading.className = 'picker-heading';
    heading.textContent = 'Välj konsert';
    container.appendChild(heading);

    if (!concerts || concerts.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'picker-empty';
        msg.textContent = 'Inga kommande konserter';
        container.appendChild(msg);
        return;
    }

    const list = document.createElement('div');
    list.className = 'picker-list';

    for (const c of concerts) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'picker-card';
        card.dataset.concertId = c.concertId;

        const name = document.createElement('span');
        name.className = 'picker-name';
        name.textContent = c.name.replace(/\[.*?\]\s*/g, '').replace(/^[^a-zA-ZåäöÅÄÖ0-9]+/, '').trim();

        const date = document.createElement('span');
        date.className = 'picker-date';
        date.textContent = c.date;

        card.appendChild(name);
        card.appendChild(date);
        card.addEventListener('click', () => onSelect(c.concertId));
        list.appendChild(card);
    }

    container.appendChild(list);
}
