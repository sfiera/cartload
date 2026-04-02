// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {arrayEq, ints, latin1, makeImage, Segment} from "./util.js";

const MFR_IDS = {};
MFR_IDS[0x98] = "Toshiba";
MFR_IDS[0xb0] = "Sharp";
MFR_IDS[0xec] = "Samsung";
const SIZE_IDS = {};
SIZE_IDS[0x00] = 0;
SIZE_IDS[0xab] = 512 * 1024;
SIZE_IDS[0x2c] = 1024 * 1024;
SIZE_IDS[0x2f] = 2048 * 1024;

export default class NeoGeoPocketCart {
  constructor(data, romSize) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x40) {
      throw new TypeError("data too short for header")
    }
    this.header = data.slice(0, 0x40);
    this.trademark = latin1.decode(this.header.slice(0x00, 0x1C));
    const titleRegexp = /^(.*?)[\u0000 ]*$/;
    const titleMatch = latin1.decode(this.header.slice(0x24, 0x30)).match(titleRegexp);
    this.title = titleMatch[1];
    this.code =
        ("NEOP" + this.header[0x21].toString(16).padStart(2, "0") +
         this.header[0x20].toString(16).padStart(2, "0"));
    this.romSize = romSize;

    this.compatibility = {
      color: !!(this.header[0x23] & 0x10),
    };

    this.valid = {
      trademark: [
        " LICENSED BY SNK CORPORATION",
        "COPYRIGHT BY SNK CORPORATION",
      ].indexOf(this.trademark) >= 0,
    };
    this.valid.header = this.valid.trademark;
  }

  get platform() { return "ngp" }
  get extension() { return "ngp"; }

  get romSegments() {
    return ints(this.romSize >> 16).map(i => new Segment(i * (1 << 16), (i + 1) * (1 << 16)));
  }
  get savSegments() { return []; }

  async headerDigest() { return await window.crypto.subtle.digest("SHA-1", this.header); }

  async backUpRom(client, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      await client.setPower(true);
      let data = [];
      const segs = this.romSegments;
      for (const [i, seg] of segs.entries()) {
        await this.selectRomSegment(client, seg);
        data.push(...await client.transfer("dmg", 0, 0x10000, {
          progress: n => callback(seg.begin + n),
          csPulse: false,
        }));
      }
      return new Uint8Array(data);
    });
  }

  async selectRomSegment(client, segment) {
    await latch(client, (segment.begin >>> 16) & 0x1F);
    await cs(client, (segment.begin >>> 21) & 0x1);
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      await client.setMode("dmg", 3.3);
      await client.setPower(true);
      await latch(client, 0);

      const size = [0, 0];
      for (const c of [0, 1]) {
        await cs(client, c);
        await client.write("dmg", 0x5555, 0xAA, {csPulse: false});
        await client.write("dmg", 0x2AAA, 0x55, {csPulse: false});
        await client.write("dmg", 0x5555, 0x90, {csPulse: false});
        const [mfrId, sizeId] = await client.transfer("dmg", 0, 2, {csPulse: false});
        await client.write("dmg", 0, 0xF0, {csPulse: false});

        if (typeof SIZE_IDS[sizeId] !== "number") {
          throw new Error("Failed to detect cartridge size");
        }
        size[c] = SIZE_IDS[sizeId];
      }
      const romSize = size[0] + size[1];
      if (romSize === 0) {
        throw new Error("No cartridge detected");
      }

      await latch(client, 0);
      await cs(client, 0);
      const data = await client.transfer("dmg", 0, 0x40, {csPulse: false});

      return new NeoGeoPocketCart(new Uint8Array(data), romSize);
    });
  }

  static async db() { return (await import("./db/ngp.json", {with: {type: "json"}})).default; }
};

const latch = async (client, value) => {
  if (value != (value & 0b11111)) {
    throw `invalid latch value ${value}`;
  }
  await client.setPin(0b00010, 1);                  // CLK
  await client.setPin(value << 6, 1);               // A1:5
  await client.setPin((value ^ 0b11111) << 6, 0);   // A1:5
  await client.setPin(0b00010, 0);                  // CLK
  await client.setPin(0b00010, 1);                  // CLK
  await client.setPin(0b111111111111111100000, 0);  // A0:15
};

const cs = async (client, index) => {
  await client.setPin(1 << 4, index !== 0);   // /CS1
  await client.setPin(1 << 29, index !== 1);  // /CS2
};
