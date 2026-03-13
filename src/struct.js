// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

const fixedSize = function(size, getter, setter) {
  return {
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
  };
};

const packFormats = {
  b: fixedSize(1, "getInt8", "setInt8"),
  B: fixedSize(1, "getUint8", "setUint8"),
  h: fixedSize(2, "getInt16", "setInt16"),
  H: fixedSize(2, "getUint16", "setUint16"),
  i: fixedSize(4, "getInt32", "setInt32"),
  I: fixedSize(4, "getUint32", "setUint32"),
  "?": {
    marshal: (args, result) => {result.push(args.shift() ? 1 : 0)},
    unmarshal: (data) => {
      if (data.length < 1) {
        return [null, null];
      } else if (data[0] > 1) {
        throw new Error("invalid boolean " + data[0]);
      }
      return [[data[0] == 1], data.slice(1)];
    },
  },
  p: {
    unmarshal: (data) => {
      let [length, remainder] = packFormats.B.unmarshal(data, {});
      if ((length === null) || (remainder.length < length)) {
        return [null, null];
      }
      return [[new Uint8Array(remainder.slice(0, length))], remainder.slice(length)];
    },
  },
  "<": {
    marshal: (args, result, options) => options.littleEndian = true,
    unmarshal: (data, options) => {
      options.littleEndian = true;
      return [[], data];
    },
  },
  ">": {
    marshal: (args, result, options) => options.littleEndian = false,
    unmarshal: (data, options) => {
      options.littleEndian = false;
      return [[], data];
    },
  },
};

export function pack(format, ...args) {
  let result = [];
  let options = {littleEndian: false};
  for (let i = 0; i < format.length; ++i) {
    packFormats[format[i]].marshal(args, result, options);
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
  const littleEndian = (format[0] === "<");
  for (let i = 0; i < format.length; ++i) {
    [values, data] = packFormats[format[i]].unmarshal(data, options);
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
