// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {arrayEq, ints, latin1, makeImage, Segment} from "./util.js";

const GGBITS = [12, 7, 6, 5, 4, 3, 2, 1, 0, 10, 15, 11, 9, 8, 13, 14];
export const addr = {
  gearToBoy: (addr) => GGBITS.entries().reduce((a, [i, b]) => a + (((addr >> b) & 1) << i), 0),
  boyToGear: (addr) => GGBITS.entries().reduce((a, [i, b]) => a + (((addr >> i) & 1) << b), 0),
};
const gearData = (boyData) => {
  const gearData = new Uint8Array(0x10000);
  for (let gearAddr = 0; gearAddr < 0x10000; ++gearAddr) {
    const boyAddr = addr.gearToBoy(gearAddr)
    gearData[gearAddr] = boyData[boyAddr];
  }
  return gearData;
};

const BANKCTRL = addr.gearToBoy(0xFFFC);
const BANK0 = addr.gearToBoy(0xFFFD);
const BANK1 = addr.gearToBoy(0xFFFE);
const BANK2 = addr.gearToBoy(0xFFFF);

export default class GameGearCart {
  constructor(data, romSize) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x4000) {
      throw new TypeError("data too short for header")
    }
    this.header = data.slice(0x3FF0, 0x4000);
    this.title = null;
    this.trademark = latin1.decode(this.header.slice(0x00, 0x0A));
    this.code = (this.header[0x0E] >> 4).toString(16) +
        this.header[0x0D].toString(16).padStart(2, "0") +
        this.header[0x0C].toString(16).padStart(2, "0");
    this.romVersion = this.header[0x0E] & 0x0F;
    this.region = this.header[0x0F] >> 4;
    this.romSize = romSize;

    this.compatibility = {
      sms: false,  // read and invert audio pin
    };

    this.valid = {
      trademark: this.trademark.slice(0, 8) == "TMR SEGA",
    };
    this.valid.header = this.valid.trademark;
  }

  get mapperName() { return "Sega" }

  get romSegments() {
    return ints(this.romSize >> 14).map((i) => new Segment(i * (1 << 14), (i + 1) * (1 << 14)));
  }
  get savSegments() {
    return ints(this.savSize >> 13).map((i) => new Segment(i * (1 << 13), (i + 1) * (1 << 13)));
  }

  get extension() { return this.compatibility.sms ? "sms" : "gg"; }

  async headerDigest() { return await window.crypto.subtle.digest("SHA-1", this.header); }

  logoImageUrl() {
    return makeImage(64, 8, (ctx) => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 64, 8);
    });
  }

  async backUpRom(client, callback) {
    callback ||= () => {};
    await client.command(cmds.CART_PWR_ON);
    try {
      let data = [];
      const segs = this.romSegments;
      for (const seg of segs) {
        data.push(...await transferRomSegment(client, seg, n => callback(seg.begin + n)));
      }
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }

  static async detect(client) {
    const seg = new Segment(0x4000, 0x8000);
    const data = await transferRomSegment(client, seg);
    if (data.every(x => x == 0)) {
      throw new Error("No cartridge detected");
    }

    for (let bankCount = 2; bankCount < 128; bankCount <<= 1) {
      await client.command(cmds.DMG_CART_WRITE, BANK1, bankCount + 1);
      const newData = await transferRomSegment(client, seg);
      if (arrayEq(newData, data)) {
        return new GameGearCart(data, bankCount * 0x4000);
      }
    }
    throw new Error("failed to detect cartridge size");
  }

  static async connect(client) {
    await client.setVariable(vars.DMG_READ_METHOD, 1);
    await client.command(cmds.SET_MODE_DMG);
    await client.command(cmds.SET_VOLTAGE_5V);
    await client.command(cmds.CART_PWR_ON);
    await client.command(cmds.DISABLE_PULLUPS);
    await client.setVariable(vars.DMG_READ_METHOD, 1);
    await client.setVariable(vars.CART_MODE, 1);
    await client.setVariable(vars.DMG_READ_CS_PULSE, 1);
    await client.setVariable(vars.DMG_WRITE_CS_PULSE, 1);
    await client.setVariable(vars.DMG_ACCESS_MODE, 1);
    await client.setVariable(vars.ADDRESS, 0x0000);
    await client.command(cmds.DMG_CART_WRITE, BANKCTRL, 0);
    await client.command(cmds.DMG_CART_WRITE, BANK0, 0);
    await client.command(cmds.DMG_CART_WRITE, BANK1, 1);
    await client.command(cmds.DMG_CART_WRITE, BANK2, 2);
  }

  static async db() { return {}; }
}

const nextBit = (val) => {
  let shift = 0;
  while (val & (1 << shift)) {
    ++shift;
  }
  return 1 << shift;
};

const transferRomSegment = async (client, segment, progress) => {
  if (segment.begin >= 0x8000) {
    await client.command(cmds.DMG_CART_WRITE, BANK2, segment.begin >> 14);
  }

  const chunkSize = 0x200;
  const skipBits = addr.boyToGear(chunkSize - 1);  // 0x10FF
  const incr = nextBit(skipBits);                  // 0x0100

  const begin = Math.min(segment.begin, 0x8000);
  let gearAddr = begin;
  const data = new Uint8Array(0x10000);
  while (gearAddr < Math.min(segment.end, 0xC000)) {
    const boyAddr = addr.gearToBoy(gearAddr);
    const chunk = await client.transfer("dmg", boyAddr, chunkSize, {progress, csPulse: true});
    for (const [i, b] of chunk.entries()) {
      data[addr.boyToGear(boyAddr + i)] = b;
    }
    gearAddr += incr;
    while (gearAddr & skipBits) {
      gearAddr += (gearAddr & skipBits);
    }
  }

  return data.slice(begin, begin + segment.size);
}
