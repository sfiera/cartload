// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {arrayEq, ints, latin1, makeImage, Segment, unhex} from "./util.js";

export const ram = true;
export const battery = true;
export const timer = true;
export const rumble = true;
export const sensor = true;
export const flash = true;
export const camera = true;
export const infrared = true;
export const speaker = true;

const nintendoLogo = unhex(
    "ceed6666cc0d000b03730083000c000d0008111f8889000e" +
    "dccc6ee6ddddd999bbbb67636e0eecccdddc999fbbb9333e");

export default class DmgCart {
  constructor(data, {
    ram = false,
    battery = false,
    timer = false,
    rumble = false,
    sensor = false,
    flash = false,
    camera = false,
    infrared = false,
    speaker = false,
  }) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be Uint8Array")
    } else if (data.length < 0x180) {
      throw new TypeError("data too short for header")
    }
    this.header = data.slice(0, 0x180);
    this.features = {ram, battery, timer, rumble, sensor, camera, infrared, speaker};

    this.logo = data.slice(0x104, 0x134);
    this.cgbFlag = (data[0x143] >= 0x80) ? data[0x143] : 0;
    const titleRegexp =
        /^(.*?)\u0000*(?:([ABHKV][A-Z2-9][A-Z2-9][ABDEFIJKPSUXY])?[\u0080-\uffff])?$/;
    const titleMatch = latin1.decode(data.slice(0x134, 0x144)).match(titleRegexp);
    this.title = titleMatch[1];
    this.code = titleMatch[2] || "";

    const romSizeCode = data[0x148];
    this.romSize = 0x8000 << romSizeCode;

    const ramSizeCode = data[0x149];
    this.savSize = !(ram && battery) ? 0 : [
      0,
      0x800,
      0x2000,
      0x8000,
      0x20000,
      0x10000,
    ][ramSizeCode];

    this.newLicensee = latin1.decode(data.slice(0x144, 0x146));
    this.sgbFlag = data[0x146];
    this.destCode = data[0x14A];
    this.oldLicensee = data[0x14B];
    this.romVersion = data[0x14C];
    this.headerCksum = data[0x14D];
    [this.romCksum] = unpack("H", data.slice(0x14E, 0x150));

    this.compatibility = {
      dmg: this.cgbFlag != 0xC0,
      cgb: !!(this.cgbFlag & 0x80),
      sgb: this.sgbFlag == 0x03,
    };

    this.valid = {
      logo: arrayEq(this.logo, nintendoLogo),
      headerCksum: data[0x14D] ==
          data.slice(0x134, 0x14D).reduce((cksum, x) => (cksum + 0xff - x) & 0xff, 0),
    };
    this.valid.header = this.valid.logo && this.valid.headerCksum;
  }

  async headerDigest() { return await window.crypto.subtle.digest("SHA-1", this.header); }

  get extension() {
    return this.compatibility.cgb ? "gbc" : this.compatibility.sgb ? "sgb" : "gb";
  }

  drawImage(ctx) {
    ctx.fillStyle = "black";

    const logo = unpack("HHHHHHHHHHHHHHHHHHHHHHHH", this.logo);
    let tileIndex = 0;
    for (let tileRow = 0; tileRow < 2; ++tileRow) {
      for (let tileCol = 0; tileCol < 12; ++tileCol) {
        const tileData = logo[tileIndex];
        let bit = 0x8000;
        for (let row = 0; row < 4; ++row) {
          for (let col = 0; col < 4; ++col) {
            const x = tileCol * 4 + col;
            const y = tileRow * 4 + row;
            if (tileData & bit) {
              ctx.fillRect(x, y, 1, 1);
            }
            bit >>= 1;
          }
        }
        ++tileIndex;
      }
    }
  }

  logoImageUrl() { return makeImage(48, 8, ctx => this.drawImage(ctx)); }

  async backUpRom(client, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      await client.command(cmds.CART_PWR_ON);
      try {
        let data = [];
        const segs = this.romSegments;
        for (const seg of segs) {
          data.push(...await this.transferRomSegment(
              client, seg, progress => callback(seg.begin + progress)));
        }
        return new Uint8Array(data);
      } finally {
        await client.command(cmds.CART_PWR_OFF);
      }
    });
  }

  get canBackUpSav() { return !!this.savSize; }

  async backUpSav(client, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      await client.command(cmds.CART_PWR_ON);
      try {
        let data = [];
        const segs = this.savSegments;
        for (const seg of segs) {
          data.push(...await this.transferSavSegment(
              client, seg, progress => callback(seg.begin + progress)));
        }
        return new Uint8Array(data);
      } finally {
        await client.command(cmds.CART_PWR_OFF);
      }
    });
  }

  get romSegments() {
    return ints(this.romSize >> 14).map((i) => new Segment(i * (1 << 14), (i + 1) * (1 << 14)));
  }

  async transferRomSegment(client, segment, progress) {
    if (segment.begin == 0) {
      return await client.transfer("dmg", 0, segment.size, {progress, csPulse: true});
    } else {
      await client.command(cmds.DMG_CART_WRITE, 0x2000, segment.begin >> 14);
      return await client.transfer("dmg", 0x4000, segment.size, {progress, csPulse: true});
    }
  }

  get savSegments() {
    return ints(this.savSize >> 13).map((i) => new Segment(i * (1 << 13), (i + 1) * (1 << 13)));
  }

  async transferSavSegment(client, segment, progress) {
    await client.command(cmds.DMG_CART_WRITE, 0x0000, 0x0A);
    try {
      await client.command(cmds.DMG_CART_WRITE, 0x4000, segment.begin >> 13);
      return await client.transfer("dmg", 0xA000, segment.size, {progress, csPulse: true});
    } finally {
      await client.command(cmds.DMG_CART_WRITE, 0x0000, 0x00);
    }
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      const header = new Uint8Array(await client.transfer("dmg", 0, 0x180, {csPulse: true}));
      if (header.every(x => x == 0)) {
        throw new Error("No cartridge detected");
      }
      let cartType = dmgCarts[header[0x147]];
      if (typeof cartType === "undefined") {
        cartType = dmgCarts[0];
      }
      return cartType(header);
    });
  }

  static async connect(client) {
    return await client.lock(0, async client => {
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.command(cmds.SET_MODE_DMG);
      await client.command(cmds.SET_VOLTAGE_5V);
      await client.command(cmds.CART_PWR_ON);
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.setVariable(vars.CART_MODE, 1);
      await client.setVariable(vars.DMG_READ_CS_PULSE, 1);
      await client.setVariable(vars.DMG_WRITE_CS_PULSE, 0);
      await client.setVariable(vars.DMG_ACCESS_MODE, 1);
      await client.setVariable(vars.ADDRESS, 0x0000);
      await client.command(cmds.DMG_MBC_RESET);
      await client.command(cmds.DMG_CART_WRITE, 0x0000, 0xFF);
    });
  }

  static async db() { return (await import("./db/dmg.json", {with: {type: "json"}})).default; }
};

class NoMapper extends DmgCart {
  constructor(header, opts = {}) {
    super(header, opts);
    this.romSize = 32768;
    this.savSize = Math.min(0x2000, this.savSize);
  }
  get mapperName() { return "None" }
  get romSegments() { return [new Segment(0, this.romSize)] }
  get savSegments() { return this.savSize ? [new Segment(0, this.savSize)] : [] }
};

class MBC1 extends DmgCart {
  constructor(header, opts = {}) { super(header, opts); }
  get mapperName() { return "MBC1" }
};

class MBC2 extends DmgCart {
  constructor(header, opts = {}) {
    super(header, opts);
    if (this.features.battery) {
      this.savSize = 0x200;
    }
  }
  get mapperName() { return "MBC2" }
  get savSegments() { return this.savSize ? [new Segment(0, this.savSize)] : [] }
};

class MBC3 extends DmgCart {
  constructor(header, opts = {}) { super(header, opts); }
  get mapperName() { return "MBC3" }
};

class MBC5 extends DmgCart {
  constructor(header, opts = {}) { super(header, opts); }
  get mapperName() { return "MBC5" }
};

class MBC6 extends DmgCart {
  constructor(header, opts = {}) { super(header, opts); }
  get mapperName() { return "MBC6" }
};

class MBC7 extends DmgCart {
  constructor(header, opts = {}) {
    super(header, opts);
    this.savSize = 0x100;
  }
  get mapperName() { return "MBC7" }

  get savSegments() { return [new Segment(0, this.savSize)]; }

  async transferSavSegment(client, segment, progress) {
    await client.command(cmds.DMG_CART_WRITE, 0x0000, 0x0A);
    await client.command(cmds.DMG_CART_WRITE, 0x4000, 0x40);
    try {
      return await client.transfer("eep", segment.begin, segment.size, {progress, csPulse: true});
    } finally {
      await client.command(cmds.DMG_CART_WRITE, 0x4000, 0x00);
      await client.command(cmds.DMG_CART_WRITE, 0x0000, 0x00);
    }
  }
};

class Camera extends DmgCart {
  constructor(header) { super(header, {ram, battery, camera}); }
  get mapperName() { return "MAC-GBD" }
};

class HuC1 extends DmgCart {
  constructor(header) { super(header, {ram, battery, infrared}); }
  get mapperName() { return "HuC-1" }
};

class HuC3 extends DmgCart {
  constructor(header) { super(header, {ram, battery, infrared, speaker, timer}); }
  get mapperName() { return "HuC-3" }
};

class Tama5 extends DmgCart {
  constructor(header) { super(header, {ram, battery, infrared, speaker, timer}); }
  get mapperName() { return "Tama5" }
};

const dmgCarts = new Array(256)
dmgCarts[0x00] = data => new NoMapper(data);
dmgCarts[0x01] = data => new MBC1(data);
dmgCarts[0x02] = data => new MBC1(data, {ram});
dmgCarts[0x03] = data => new MBC1(data, {ram, battery});
dmgCarts[0x05] = data => new MBC2(data);
dmgCarts[0x06] = data => new MBC2(data, {battery});
dmgCarts[0x08] = data => new NoMapper(data, {ram});
dmgCarts[0x09] = data => new NoMapper(data, {ram, battery});
dmgCarts[0x0b] = data => new MMM01(data);
dmgCarts[0x0c] = data => new MMM01(data, {ram});
dmgCarts[0x0d] = data => new MMM01(data, {ram, battery});
dmgCarts[0x0f] = data => new MBC3(data, {timer, battery});
dmgCarts[0x10] = data => new MBC3(data, {timer, ram, battery});
dmgCarts[0x11] = data => new MBC3(data);
dmgCarts[0x12] = data => new MBC3(data, {ram});
dmgCarts[0x13] = data => new MBC3(data, {ram, battery});
dmgCarts[0x19] = data => new MBC5(data);
dmgCarts[0x1a] = data => new MBC5(data, {ram});
dmgCarts[0x1b] = data => new MBC5(data, {ram, battery});
dmgCarts[0x1c] = data => new MBC5(data, {rumble});
dmgCarts[0x1d] = data => new MBC5(data, {rumble, ram});
dmgCarts[0x1e] = data => new MBC5(data, {rumble, ram, battery});
dmgCarts[0x20] = data => new MBC6(data);
dmgCarts[0x22] = data => new MBC7(data, {sensor, rumble, ram, battery});
dmgCarts[0xfc] = data => new Camera(data);
dmgCarts[0xfd] = data => new Tama5(data);
dmgCarts[0xfe] = data => new HuC3(data);
dmgCarts[0xff] = data => new HuC1(data);
