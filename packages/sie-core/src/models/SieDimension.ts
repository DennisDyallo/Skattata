import { SieObject } from './SieObject.js';

export class SieDimension {
  number: string = '';
  name: string = '';
  parentNumber: string = '';
  objects: Map<string, SieObject> = new Map();
}
