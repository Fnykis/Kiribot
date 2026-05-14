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
    _draggingPosition = null;
    _draggingSidebarUserId = null;
    _selectedIds = new Set();
    _mestres = new Map();
}

let _draggingPosition = null;
let _draggingSidebarUserId = null;

export function getDraggingPosition() { return _draggingPosition; }
export function setDraggingPosition(pos) { _draggingPosition = pos; }

export function getDraggingSidebarUserId() { return _draggingSidebarUserId; }
export function setDraggingSidebarUserId(id) { _draggingSidebarUserId = id; }

let _selectedIds = new Set();
export function getSelectedIds() { return _selectedIds; }
export function setSelectedIds(ids) { _selectedIds = new Set(ids); }
export function clearSelectedIds() { _selectedIds = new Set(); }

let _isSelecting = false;
export function getIsSelecting() { return _isSelecting; }
export function setIsSelecting(v) { _isSelecting = v; }

let _mestres = new Map(); // userId → {x, y}
export function getMestres() { return _mestres; }
export function toggleMestre(userId, initialPos) {
    const s = String(userId);
    if (_mestres.has(s)) _mestres.delete(s);
    else _mestres.set(s, initialPos);
}
export function setMestrePos(userId, pos) {
    const s = String(userId);
    if (_mestres.has(s)) _mestres.set(s, pos);
}
export function clearMestres() { _mestres = new Map(); }
