// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {pack, unpack} from "./struct.js";
import {arrayEq, hex, ints, latin1, makeImage, Segment, sha1, unhex, v} from "./util.js";

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
  constructor(data, dbEntry, {
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
    this.dbEntry = dbEntry;
    this.features = {ram, battery, timer, rumble, sensor, camera, infrared, speaker};

    this.logo = data.slice(0x104, 0x134);
    this.cgbFlag = (data[0x143] >= 0x80) ? data[0x143] : 0;
    const titleRegexp =
        /^(.*?)\u0000*(?:([ABHKV][A-Z2-9][A-Z2-9][ABDEFIJKPSUXY])?[\u0080-\uffff])?$/;
    const titleMatch = latin1.decode(data.slice(0x134, 0x144)).match(titleRegexp);
    this.title = titleMatch[1];
    this.code = titleMatch[2] || undefined;

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

  get platform() { return "dmg" }

  get romFormats() {
    return [this.compatibility.cgb ? "gbc" : this.compatibility.sgb ? "sgb" : "gb"];
  }
  get savFormats() { return ["sav"]; }

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

  async backUpRom(client, format, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      await client.setPower(true);
      let data = [];
      const segs = this.romSegments;
      for (const seg of segs) {
        data.push(...await this.transferRomSegment(
            client, seg, progress => callback(seg.begin + progress)));
      }
      return new Uint8Array(data);
    });
  }

  async backUpSav(client, format, callback) {
    return await client.lock(0, async client => {
      callback ||= () => {};
      await client.setPower(true);
      let data = [];
      const segs = this.savSegments;
      for (const seg of segs) {
        data.push(...await this.transferSavSegment(
            client, seg, progress => callback(seg.begin + progress)));
      }
      return new Uint8Array(data);
    });
  }

  get romSegments() {
    return ints(this.romSize >> 14).map((i) => new Segment(i * (1 << 14), (i + 1) * (1 << 14)));
  }

  async transferRomSegment(client, segment, progress) {
    if (segment.begin == 0) {
      return await client.readRange("dmg", 0, segment.size, {progress, csPulse: true});
    } else {
      await client.write("dmg", 0x2000, segment.begin >> 14);
      return await client.readRange("dmg", 0x4000, segment.size, {progress, csPulse: true});
    }
  }

  get savSegments() {
    return ints(this.savSize >> 13).map((i) => new Segment(i * (1 << 13), (i + 1) * (1 << 13)));
  }

  async transferSavSegment(client, segment, progress) {
    await client.write("dmg", 0x0000, 0x0A);
    try {
      await client.write("dmg", 0x4000, segment.begin >> 13);
      return await client.readRange("dmg-ram", 0xA000, segment.size, {progress, csPulse: true});
    } finally {
      await client.write("dmg", 0x0000, 0x00);
    }
  }

  static async detect(client) {
    return await client.lock(0, async client => {
      await client.setMode("dmg", 5);
      await client.setPower(true);
      await client.dmgBoot();
      await client.write("dmg", 0x0000, 0xFF);

      const header = new Uint8Array(await client.readRange("dmg", 0, 0x180, {csPulse: true}));
      if (header.every(x => x == 0)) {
        throw new Error("No cartridge detected");
      }
      let cartType = dmgCarts[header[0x147]];
      if (cartType === undefined) {
        cartType = dmgCarts[0];
      }
      const dbEntry = (await DmgCart.db())[hex(await sha1(header))];
      return cartType(header, dbEntry);
    });
  }

  static async db() { return (await import("./db/dmg.json", {with: {type: "json"}})).default; }
};

class NoMapper extends DmgCart {
  constructor(header, dbEntry, opts = {}) {
    super(header, dbEntry, opts);
    this.romSize = 32768;
    this.savSize = Math.min(0x2000, this.savSize);
  }
  get mapperName() { return "None" }
  get romSegments() { return [new Segment(0, this.romSize)] }
  get savSegments() { return this.savSize ? [new Segment(0, this.savSize)] : [] }
};

class MBC1 extends DmgCart {
  constructor(header, dbEntry, opts = {}) { super(header, dbEntry, opts); }
  get mapperName() { return "MBC1" }
};

class MBC2 extends DmgCart {
  constructor(header, dbEntry, opts = {}) {
    super(header, dbEntry, opts);
    if (this.features.battery) {
      this.savSize = 0x200;
    }
  }
  get mapperName() { return "MBC2" }
  get savSegments() { return this.savSize ? [new Segment(0, this.savSize)] : [] }
};

class MBC3 extends DmgCart {
  constructor(header, dbEntry, opts = {}) { super(header, dbEntry, opts); }
  get mapperName() { return "MBC3" }
};

class MBC5 extends DmgCart {
  constructor(header, dbEntry, opts = {}) { super(header, dbEntry, opts); }
  get mapperName() { return "MBC5" }
};

class MBC6 extends DmgCart {
  constructor(header, dbEntry, opts = {}) { super(header, dbEntry, opts); }
  get mapperName() { return "MBC6" }
};

class MBC7 extends DmgCart {
  constructor(header, dbEntry, opts = {}) {
    super(header, dbEntry, opts);
    this.savSize = 0x100;
  }
  get mapperName() { return "MBC7" }

  get savSegments() { return [new Segment(0, this.savSize)]; }

  async transferSavSegment(client, segment, progress) {
    await client.write("dmg", 0x0000, 0x0A);
    await client.write("dmg", 0x4000, 0x40);
    try {
      return await client.readRange(
          "dmg-eep", segment.begin, segment.size, {progress, csPulse: true});
    } finally {
      await client.write("dmg", 0x4000, 0x00);
      await client.write("dmg", 0x0000, 0x00);
    }
  }
};

class Camera extends DmgCart {
  constructor(header, dbEntry) { super(header, dbEntry, {ram, battery, camera}); }
  get mapperName() { return "MAC-GBD" }

  async transferSavSegment(client, segment, progress) {
    await client.write("dmg", 0x4000, segment.begin >> 13, {csPulse: false});
    return await client.readRange("dmg-ram", 0xA000, segment.size, {progress, csPulse: true});
  }
};

class HuC1 extends DmgCart {
  constructor(header, dbEntry) { super(header, dbEntry, {ram, battery, infrared}); }
  get mapperName() { return "HuC-1" }
};

class HuC3 extends DmgCart {
  constructor(header, dbEntry) {
    super(header, dbEntry, {ram, battery, infrared, speaker, timer});
  }
  get mapperName() { return "HuC-3" }
};

class Tama5 extends DmgCart {
  constructor(header, dbEntry) {
    super(header, dbEntry, {ram, battery, infrared, speaker, timer});
  }
  get mapperName() { return "Tama5" }
};

const dmgCarts = new Array(256)
dmgCarts[0x00] = (...args) => new NoMapper(...args);
dmgCarts[0x01] = (...args) => new MBC1(...args);
dmgCarts[0x02] = (...args) => new MBC1(...args, {ram});
dmgCarts[0x03] = (...args) => new MBC1(...args, {ram, battery});
dmgCarts[0x05] = (...args) => new MBC2(...args);
dmgCarts[0x06] = (...args) => new MBC2(...args, {battery});
dmgCarts[0x08] = (...args) => new NoMapper(...args, {ram});
dmgCarts[0x09] = (...args) => new NoMapper(...args, {ram, battery});
dmgCarts[0x0b] = (...args) => new MMM01(...args);
dmgCarts[0x0c] = (...args) => new MMM01(...args, {ram});
dmgCarts[0x0d] = (...args) => new MMM01(...args, {ram, battery});
dmgCarts[0x0f] = (...args) => new MBC3(...args, {timer, battery});
dmgCarts[0x10] = (...args) => new MBC3(...args, {timer, ram, battery});
dmgCarts[0x11] = (...args) => new MBC3(...args);
dmgCarts[0x12] = (...args) => new MBC3(...args, {ram});
dmgCarts[0x13] = (...args) => new MBC3(...args, {ram, battery});
dmgCarts[0x19] = (...args) => new MBC5(...args);
dmgCarts[0x1a] = (...args) => new MBC5(...args, {ram});
dmgCarts[0x1b] = (...args) => new MBC5(...args, {ram, battery});
dmgCarts[0x1c] = (...args) => new MBC5(...args, {rumble});
dmgCarts[0x1d] = (...args) => new MBC5(...args, {rumble, ram});
dmgCarts[0x1e] = (...args) => new MBC5(...args, {rumble, ram, battery});
dmgCarts[0x20] = (...args) => new MBC6(...args);
dmgCarts[0x22] = (...args) => new MBC7(...args, {sensor, rumble, ram, battery});
dmgCarts[0xfc] = (...args) => new Camera(...args);
dmgCarts[0xfd] = (...args) => new Tama5(...args);
dmgCarts[0xfe] = (...args) => new HuC3(...args);
dmgCarts[0xff] = (...args) => new HuC1(...args);
