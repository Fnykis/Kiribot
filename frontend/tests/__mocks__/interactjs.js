// Stub for interactjs — only used at runtime, not needed in unit tests
const interact = () => ({
    draggable: () => ({ on: () => {} }),
    dropzone: () => ({ on: () => {} }),
    gesturable: () => ({ on: () => {} }),
});
export default interact;
