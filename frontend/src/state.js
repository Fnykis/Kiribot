let _event = null;
let _draggingId = null;
let _concerts = null;
let _selectedConcertId = null;

export function getEvent() { return _event; }
export function setEvent(event) { _event = event; }

export function getDraggingId() { return _draggingId; }
export function setDraggingId(id) { _draggingId = id; }

export function getConcerts() { return _concerts; }
export function setConcerts(concerts) { _concerts = concerts; }

export function getSelectedConcertId() { return _selectedConcertId; }
export function setSelectedConcertId(id) { _selectedConcertId = id; }

export function clearSelectedConcert() {
    _selectedConcertId = null;
    _event = null;
}

let _draggingPosition = null;
let _draggingSidebarUserId = null;

export function getDraggingPosition() { return _draggingPosition; }
export function setDraggingPosition(pos) { _draggingPosition = pos; }

export function getDraggingSidebarUserId() { return _draggingSidebarUserId; }
export function setDraggingSidebarUserId(id) { _draggingSidebarUserId = id; }
