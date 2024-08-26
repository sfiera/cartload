export class Segment {
  constructor(begin, end) {
    this.begin = begin;
    this.end = end;
  }

  get size() { return this.end - this.begin; }
};

export const unhex = (data) => new Uint8Array(
    data.match(/[0-9a-fA-F]{2}/g).map((val) => parseInt(val, 16)));

export const hex = (array) =>
    Array.prototype.map.call(array, (x) => x.toString(16).padStart(2, '0'))
        .join("");

export const latin1 = new TextDecoder("latin1");
