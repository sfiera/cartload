// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

export class Segment {
  constructor(begin, end) {
    this.begin = begin;
    this.end = end;
  }

  get size() { return this.end - this.begin; }
};

export const arrayEq = (a, b) => (a.length == b.length) && a.every((x, i) => x == b[i]);
export const ints = (length) => Array(length).fill(0).map((_, i) => i);

export const unhex = (data) =>
    new Uint8Array(data.match(/[0-9a-fA-F]{2}/g).map((val) => parseInt(val, 16)));

export const hex = (array) => {
  if (array instanceof ArrayBuffer) {
    array = new Uint8Array(array);
  }
  return Array.prototype.map.call(array, (x) => x.toString(16).padStart(2, "0")).join("");
};


export const latin1 = new TextDecoder("latin1");

export const unitBytes = (n) => {
  if (!n) {
    return "0";
  } else if ((n % (1 << 30)) == 0) {
    return (n >> 30) + " GiB";
  } else if ((n % (1 << 20)) == 0) {
    return (n >> 20) + " MiB";
  } else if ((n % (1 << 10)) == 0) {
    return (n >> 10) + " KiB";
  } else {
    return n + " B";
  }
};

export const makeElement = (tagName, properties = {}) => {
  const el = document.createElement(tagName);
  Object.entries(properties).forEach(([key, value]) => {
    if (key === "children") {
      el.replaceChildren(...value);
    } else if (key === "ondrop") {
      el.addEventListener("dragenter", e => {el.classList.add("dropTarget")});
      el.addEventListener("dragleave", e => {el.classList.remove("dropTarget")});
      el.addEventListener("dragover", e => {e.preventDefault()});
      el.addEventListener("drop", (e, ...args) => {
        e.preventDefault();
        el.classList.remove("dropTarget");
        value(e, ...args);
      });
    } else {
      el[key] = value;
    }
  });
  return el;
};

export const makeImage = (width, height, fn) => {
  const canvas = makeElement("canvas", {
    width: width,
    height: height,
  });
  fn(canvas.getContext("2d"));
  return canvas.toDataURL();
};

export const toDataUrl = buffer => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(new Blob([buffer]));
});

export const downloadUrl = (filename, url) => {
  makeElement("a", {download: filename, href: url}).click();
};
