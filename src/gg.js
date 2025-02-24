import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {ints, latin1, makeImage, Segment} from "./util.js";

const GGBITS = [12, 7, 6, 5, 4, 3, 2, 1, 0, 10, 15, 11, 9, 8, 13, 14];
export const shuffleAddr = (addr) =>
    GGBITS.entries().reduce((a, [i, b]) => a + (((addr >> b) & 1) << i), 0);
export const unshuffleAddr = (addr) =>
    GGBITS.entries().reduce((a, [i, b]) => a + (((addr >> i) & 1) << b), 0);
const unshuffleData = (data) => {
  var result = new Uint8Array(0x10000);
  for (let addr = 0; addr < 0x10000; ++addr) {
    result[addr] = data[shuffleAddr(addr)];
  }
  return result;
};

const BANKCTRL = shuffleAddr(0xFFFC);
const BANK0 = shuffleAddr(0xFFFD);
const BANK1 = shuffleAddr(0xFFFE);
const BANK2 = shuffleAddr(0xFFFF);

class GameGearCart {
  constructor(data, romSize) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x10) {
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

  logoImageUrl(header) {
    return makeImage(64, 8, (ctx) => {
      ctx.fillStyle = "black";

      const trademark = header.slice(0, 8);
      ctx.fillRect(0, 0, 64, 8);
    });
  }

  async backUpRom(client) {
    await client.command(cmds.CART_PWR_ON);
    try {
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.setVariable(vars.DMG_ACCESS_MODE, 1);  // MODE_ROM_READ
      await client.setVariable(vars.CART_MODE, 1);
      await client.setVariable(vars.DMG_READ_CS_PULSE, 1);
      let data = [];
      const segs = this.romSegments;
      for (const [i, seg] of segs.entries()) {
        await this.selectRomSegment(client, seg);
        console.log(`Segment ${i+1}/${segs.length}`);
        const segData = unshuffleData(await client.transfer(cmds.DMG_CART_READ, 0x10000));
        const begin = Math.min(seg.begin, 0x8000);
        data.push(...segData.slice(begin, begin + seg.size));
      }
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }

  async selectRomSegment(client, segment) {
    if (segment.begin >= 0x8000) {
      await client.command(cmds.DMG_CART_WRITE, BANK2, segment.begin >> 14);
    }
    await client.setVariable(vars.ADDRESS, 0x0000);
  }
};

export const detect = async (client) => {
  await client.setVariable(vars.ADDRESS, 0x0000);
  const data =
      unshuffleData(await client.transfer(cmds.DMG_CART_READ, 0x10000)).slice(0x4000, 0x8000);
  for (let bankCount = 2; bankCount < 128; bankCount <<= 1) {
    await client.command(cmds.DMG_CART_WRITE, BANK1, bankCount + 1);
    await client.setVariable(vars.ADDRESS, 0x0000);
    const newData =
        unshuffleData(await client.transfer(cmds.DMG_CART_READ, 0x10000)).slice(0x4000, 0x8000);
    if (newData.every((byte, index) => byte == data[index])) {
      return new GameGearCart(data, bankCount * 0x4000);
    }
  }
  throw new Error("failed to detect cartridge size");
};

export const connect = async (client) => {
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
};
