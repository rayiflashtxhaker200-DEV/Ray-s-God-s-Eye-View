import { createSourceSlot } from '../sources/sourceSlot.js';

const windSlot = createSourceSlot({}, [], 'Wind source');

export const configureWindSource = windSlot.configure;
export const windSource = windSlot.source;
