import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {ints, latin1, makeImage, Segment} from "./util.js";

export const ram = true;
export const battery = true;
export const timer = true;
export const rumble = true;
export const sensor = true;
export const flash = true;
export const camera = true;
export const infrared = true;
export const speaker = true;

const nintendoLogo = new Uint8Array([
  0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
  0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
  0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
]);

class DmgCart {
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
    this.header = data;
    this.features = {ram, battery, timer, rumble, sensor, camera, infrared, speaker};

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
      logo: !data.slice(0x104, 0x134).some((x, i) => nintendoLogo[i] != x),
      headerCksum: data[0x14D] ==
          data.slice(0x134, 0x14D).reduce((cksum, x) => (cksum + 0xff - x) & 0xff, 0),
    };
    this.valid.header = this.valid.logo && this.valid.headerCksum;
  }

  get romSegments() {
    return ints(this.romSize >> 14).map((i) => new Segment(i * (1 << 14), (i + 1) * (1 << 14)));
  }
  get savSegments() {
    return ints(this.savSize >> 13).map((i) => new Segment(i * (1 << 13), (i + 1) * (1 << 13)));
  }

  get extension() {
    return this.compatibility.cgb ? "cgb" : this.compatibility.sgb ? "sgb" : "gb";
  }

  logoImageUrl(header) {
    return makeImage(48, 8, (ctx) => {
      ctx.fillStyle = "black";

      const logo = unpack("HHHHHHHHHHHHHHHHHHHHHHHH", header.slice(0x104, 0x134));
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
    });
  }

  async backUpRom(client) {
    await client.command(cmds.CART_PWR_ON);
    try {
      await client.command(cmds.DISABLE_PULLUPS);
      await client.setVariable(vars.DMG_READ_METHOD, 1);
      await client.setVariable(vars.DMG_ACCESS_MODE, 1);  // MODE_ROM_READ
      await client.setVariable(vars.CART_MODE, 1);
      await client.setVariable(vars.DMG_READ_CS_PULSE, 0);
      let data = [];
      const segs = this.romSegments;
      for (const [i, seg] of segs.entries()) {
        await this.selectRomSegment(client, seg);
        console.log(`Segment ${i + 1}/${segs.length}`);
        data.push(...await client.transfer(cmds.DMG_CART_READ, seg.size));
      }
      return new Uint8Array(data);
    } finally {
      await client.command(cmds.CART_PWR_OFF);
    }
  }

  async selectRomSegment(client, segment) {
    if (segment.begin == 0) {
      await client.setVariable(vars.ADDRESS, 0);
    } else {
      await client.command(cmds.DMG_CART_WRITE, 0x2000, segment.begin >> 14);
      await client.setVariable(vars.ADDRESS, 0x4000);
    }
  }
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

export const detect = async (client) => {
  const header = new Uint8Array(await client.transfer(cmds.DMG_CART_READ, 0x180));
  let cartType = dmgCarts[header[0x147]];
  if (typeof cartType === "undefined") {
    cartType = dmgCarts[0];
  }
  return cartType(header);
};

export const connect = async (client) => {
  await client.setVariable(vars.DMG_READ_METHOD, 1);
  await client.command(cmds.SET_MODE_DMG);
  await client.command(cmds.SET_VOLTAGE_5V);
  await client.command(cmds.CART_PWR_ON);
  await client.command(cmds.DISABLE_PULLUPS);
  await client.setVariable(vars.DMG_READ_METHOD, 1);
  await client.setVariable(vars.CART_MODE, 1);
  await client.setVariable(vars.DMG_READ_CS_PULSE, 0);
  await client.setVariable(vars.DMG_WRITE_CS_PULSE, 0);
  await client.setVariable(vars.DMG_ACCESS_MODE, 1);
  await client.setVariable(vars.ADDRESS, 0x0000);
  await client.command(cmds.DMG_MBC_RESET);
};
