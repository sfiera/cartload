// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {arrayEq, hex, ints, latin1, makeImage, Segment, sha1} from "./util.js";

// LYNX pg0 pg1 ver cart mfr rot bank sav
const lnx = "<4sHHH32s16sBBB3x";

export default class LynxCart {
  constructor(data, dbEntry, romSize) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x400) {
      throw new TypeError("data too short for header")
    }
    this.header = data.slice(0, 0x400);
    this.dbEntry = dbEntry;
    this.romSize = romSize;

    this.valid = {};
    this.valid.header = true;
  }

  get platform() { return "lynx" }
  get romFormats() { return ["lyx"]; }

  async backUpRom(client, format, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      const deBruijn = Uint8Array.fromBase64("AoOCQ0LDwiMyKjomNi4+KTk1LT2zsnPz8quurW/v/gE=");
      await client.setPower(true);
      await shift(client, 7, 0);
      let acc = 0;
      let total = 0;
      const data = new Uint8Array(this.romSize);
      for (let b of deBruijn) {
        for (const _ of ints(8)) {
          await shift(client, 1, b & 1);
          acc = (b & 1) | ((acc << 1) & 0xFF);
          b >>>= 1;
          const chunk = await client.readRange("dmg", 0, this.romSize >>> 8, {
            progress: n => callback(total + n),
            csPulse: false,
          });
          chunk.forEach((b, i) => data[(acc * (this.romSize >>> 8)) | i] = b);
          total += this.romSize >>> 8;
        }
      };
      return new Uint8Array(data);
    });
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      await client.setMode("dmg", 5);
      await client.setPower(true);
      await shift(client, 8, 0);

      let data = await client.readRange("dmg", 0, 0x800, {csPulse: false});
      let size;
      if (data.every(x => x == 0)) {
        throw new Error("No cartridge detected");
      } else if (!data.slice(0x400).every((x, i) => x === data[0x3FF] || x === data[i])) {
        size = 0x80000;
      } else if (!data.slice(0x200, 0x400).every((x, i) => x === data[0x1FF] || x === data[i])) {
        size = 0x40000;
      } else {
        data.splice(0x200);
        await shift(client, 1, 1);
        data.push(...await client.readRange("dmg", 0, 0x200, {csPulse: false}));
        size = 0x20000;
      }
      data = new Uint8Array(data);
      const dbEntry = (await LynxCart.db())[hex(await sha1(data))];
      return new LynxCart(new Uint8Array(data), dbEntry, size);
    });
  }

  static async db() { return (await import("./db/lynx.json", {with: {type: "json"}})).default; }
};

const shift = async (client, count, value) => {
  for (const i of ints(count)) {
    await client.setPin(0b10000, 1);                           // /CS
    await client.setPin(0b00010, (value & (1 << i)) ? 1 : 0);  // CLK
    await client.setPin(0b10000, 0);                           // /CS
    await client.setPin(0b10000, 1);                           // /CS
  }
};
