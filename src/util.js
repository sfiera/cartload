export class Segment {
  constructor(begin, end) {
    this.begin = begin;
    this.end = end;
  }

  get size() { return this.end - this.begin; }
};

export const unhex = (data) =>
    new Uint8Array(data.match(/[0-9a-fA-F]{2}/g).map((val) => parseInt(val, 16)));

export const hex = (array) => {
  if (array instanceof ArrayBuffer) {
    array = new Uint8Array(array);
  }
  return Array.prototype.map.call(array, (x) => x.toString(16).padStart(2, "0")).join("");
};

export const ints = (length) => {
  let result = [];
  for (let i = 0; i < length; ++i) {
    result.push(i);
  }
  return result;
};

export const latin1 = new TextDecoder("latin1");

export const unitBytes = (n) => {
  if ((n % (1 << 30)) == 0) {
    return (n >> 30) + " GiB";
  } else if ((n % (1 << 20)) == 0) {
    return (n >> 20) + " MiB";
  } else if ((n % (1 << 10)) == 0) {
    return (n >> 10) + " KiB";
  } else {
    return n + " B";
  }
};
