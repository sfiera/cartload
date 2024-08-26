const fixedSize = function(size, getter, setter) {
  return {
    marshal : (value, result) => {
      const data = new Uint8Array(size);
      const view = new DataView(data.buffer);
      view[setter](0, value); // big-endian
      result.push(...data);
    },
    unmarshal : (data) => {
      if (data.length < size) {
        return [ null, null ];
      }
      const view = new DataView(data.buffer);
      const value = view[getter](0); // big-endian
      return [ value, data.slice(size) ];
    },
  };
};

const packFormats = {
  b : fixedSize(1, "getInt8", "setInt8"),
  B : fixedSize(1, "getUint8", "setUint8"),
  h : fixedSize(2, "getInt16", "setInt16"),
  H : fixedSize(2, "getUint16", "setUint16"),
  i : fixedSize(4, "getInt32", "setInt32"),
  I : fixedSize(4, "getUint32", "setUint32"),
  "?" : {
    marshal : (value, result) => {result.push([ value ? 1 : 0 ])},
    unmarshal : (data) => {
      if (data.length < 1) {
        return [ null, null ];
      } else if (data[0] > 1) {
        throw new Error("invalid boolean " + value);
      }
      return [ data[0] == 1, data.slice(1) ];
    },
  },
  p : {
    unmarshal : (data) => {
      let [length, remainder] = packFormats.B.unmarshal(data);
      if ((length === null) || (remainder.length < length)) {
        return [ null, null ];
      }
      return [
        new Uint8Array(remainder.slice(0, length)), remainder.slice(length)
      ];
    },
  },
};

export function pack(format, ...args) {
  let result = [];
  for (let i = 0; i < format.length; ++i) {
    packFormats[format[i]].marshal(args[i], result);
  }
  return new Uint8Array(result);
};

export function unpack(format, data) {
  let result = [];
  let value = null;
  for (let i = 0; i < format.length; ++i) {
    [value, data] = packFormats[format[i]].unmarshal(data);
    if (value === null) {
      throw new Error("data underflow");
    }
    result.push(value);
  }
  if (data.length) {
    throw new Error("excess data");
  }
  return result;
};
