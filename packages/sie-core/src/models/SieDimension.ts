import { SieObject } from './SieObject.js';

export class SieDimension {
  number: string = '';
  name: string = '';
  objects: Map<string, SieObject> = new Map();
}
