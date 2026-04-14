// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

const repeat = single => ({
  marshal: (count, args, result, options) => {
    for (let i = 0; i < count; ++i) {
      single.marshal(args, result, options);
    }
  },
  unmarshal: (count, data, options) => {
    const result = [];
    let values;
    for (let i = 0; i < count; ++i) {
      [values, data] = single.unmarshal(data, options);
      if (values === null) {
        return [null, null];
      }
      result.push(...values);
    }
    return [result, data];
  },
});

const fixedSize = function(size, getter, setter) {
  return repeat({
    marshal: (args, result, {littleEndian = false}) => {
      const data = new Uint8Array(size);
      const view = new DataView(data.buffer);
      view[setter](0, args.shift(), littleEndian);
      result.push(...data);
    },
    unmarshal: (data, {littleEndian = false}) => {
      if (data.length < size) {
        return [null, null];
      }
      const view = new DataView(data.buffer);
      const value = view[getter](0, littleEndian);
      return [[value], data.slice(size)];
    },
  });
};

const packFormats = {
  b: fixedSize(1, "getInt8", "setInt8"),
  B: fixedSize(1, "getUint8", "setUint8"),
  h: fixedSize(2, "getInt16", "setInt16"),
  H: fixedSize(2, "getUint16", "setUint16"),
  i: fixedSize(4, "getInt32", "setInt32"),
  I: fixedSize(4, "getUint32", "setUint32"),
  "?": repeat({
    marshal: (args, result) => {result.push(args.shift() ? 1 : 0)},
    unmarshal: data => {
      if (data.length < 1) {
        return [null, null];
      } else if (data[0] > 1) {
        throw new Error("invalid boolean " + data[0]);
      }
      return [[data[0] == 1], data.slice(1)];
    },
  }),
  p: repeat({
    unmarshal: data => {
      let [length, remainder] = packFormats.B.unmarshal(1, data, {});
      if ((length === null) || (remainder.length < length)) {
        return [null, null];
      }
      return [[new Uint8Array(remainder.slice(0, length))], remainder.slice(length)];
    },
  }),
  s: {
    marshal: (count, args, result) => {
      const str = [...args.shift()];
      if (str.length > count) {
        throw new Error("string length " + str.length);
      } else if (str.length < count) {
        str.push(...new Array(count - str.length).fill(0));
      }
      result.push(...str);
    },
    unmarshal: (count, data) => {
      if (data.length < count) {
        return [null, null];
      }
      return [[new Uint8Array(data.slice(0, count))], data.slice(count)];
    },
  },
  x: {
    marshal: (count, args, result) => result.push(...new Array(count).fill(0)),
    unmarshal: (count, data) => (data.length >= count) ? [[], data.slice(count)] : [null, null],
  },
  "<": {
    marshal: (_, args, result, options) => options.littleEndian = true,
    unmarshal: (_, data, options) => (options.littleEndian = true, [[], data]),
  },
  ">": {
    marshal: (_, args, result, options) => options.littleEndian = false,
    unmarshal: (_, data, options) => (options.littleEndian = false, [[], data]),
  },
};

export function pack(format, ...args) {
  let result = [];
  let options = {littleEndian: false};
  for (const [_, n, ch] of format.matchAll(/([0-9]*)([^0-9])/g)) {
    const count = n ? parseInt(n) : 1;
    packFormats[ch].marshal(count, args, result, options);
  }
  if (args.length) {
    throw new Error("excess args");
  }
  return new Uint8Array(result);
};

export function unpack(format, data) {
  let result = [];
  let options = {littleEndian: false};
  let values;
  if (!(data instanceof Uint8Array)) {
    data = new Uint8Array(data);
  }
  for (const [_, n, ch] of format.matchAll(/([0-9]*)([^0-9])/g)) {
    const count = n ? parseInt(n) : 1;
    [values, data] = packFormats[ch].unmarshal(count, data, options);
    if (values === null) {
      throw new Error("data underflow");
    }
    result.push(...values);
  }
  if (data.length) {
    throw new Error("excess data");
  }
  return result;
};
