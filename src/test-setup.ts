import '@testing-library/jest-dom';

// jsdom does not implement pointer capture APIs used by drag-based components
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
