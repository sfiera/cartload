import {pack, unpack} from "./struct.js";
import {latin1, Segment} from "./util.js";

class DmgCart {
  constructor(mapperName, header, opts) {
    this.mapper = mapperName;

    this.cgbFlag = (header[0x143] >= 0x80) ? header[0x143] : 0;
    const titleRegexp =
        this.cgbFlag
            ? /^(.*?)\u0000*([ABHKV][A-Z2-9][A-Z2-9][ABDEFIJKPSUXY])?[\u0080-\uffff]$/
            : /^(.*?)\u0000*()$/;
    const titleMatch =
        latin1.decode(header.slice(0x134, 0x144)).match(titleRegexp);
    this.title = titleMatch[1];
    this.mfrCode = titleMatch[2] || "";

    const romSizeCode = header[0x148];
    this.romSize = 0x8000 << romSizeCode;

    const ramSizeCode = header[0x149];
    this.ramSize = [ 0, 0x800, 0x2000, 0x8000, 0x20000, 0x10000 ][ramSizeCode];

    this.newLicensee = latin1.decode(header.slice(0x144, 0x146));
    this.sgbFlag = header[0x146];
    this.destCode = header[0x14A];
    this.oldLicensee = header[0x14B];
    this.romVersion = header[0x14C];
    this.headerCksum = header[0x14D];
    [this.romCksum] = unpack("H", header.slice(0x14E, 0x150));
    this.validHeader = true;
  }
};

class NoMapper extends DmgCart {
  constructor(header, opts = {}) {
    super("NoMapper", header, opts);
    this.romSize = 32768;
    this.ramSize = 0;
  }
  get mapperName() { return "None" }
  get romSegments() { return [ new Segment(0, 0x8000) ] }
  get ramSegments() { return [] }
};

class MBC1 extends DmgCart {
  constructor(header, opts = {}) { super("NoMapper", header, opts); }
  get mapperName() { return "MBC1" }
};

const noMapper = opts => (header => new NoMapper(header, opts));
const mbc1 = opts => (header => new MBC1(header, opts));
const mbc2 = opts => (header => new MBC2(header, opts));
const mbc3 = opts => (header => new MBC3(header, opts));
const mbc5 = opts => (header => new MBC5(header, opts));
const mbc6 = opts => (header => new MBC6(header, opts));
const mbc7 = opts => (header => new MBC7(header, opts));
const mmm01 = opts => (header => new MMM01(header, opts));
const camera = header => new Camera(header);
const tama5 = header => new Tama5(header);
const huc3 = header => new HuC3(header);
const huc1 = header => new HuC1(header);

const ram = null;
const battery = null;
const timer = null;
const rumble = null;
const sensor = null;

const dmgCarts = {
  0 : noMapper(),
  1 : mbc1(),
  2 : mbc1({ram}),
  3 : mbc1({ram, battery}),
  5 : mbc2(),
  6 : mbc2({battery}),
  8 : noMapper({ram}),
  9 : noMapper({ram, battery}),
  11 : mmm01(),
  12 : mmm01({ram}),
  13 : mmm01({ram, battery}),
  15 : mbc3({timer, battery}),
  16 : mbc3({timer, ram, battery}),
  17 : mbc3(),
  18 : mbc3({ram}),
  19 : mbc3({ram, battery}),
  25 : mbc5(),
  26 : mbc5({ram}),
  27 : mbc5({ram, battery}),
  28 : mbc5({rumble}),
  29 : mbc5({rumble, ram}),
  30 : mbc5({rumble, ram, battery}),
  32 : mbc6(),
  34 : mbc7({sensor, rumble, ram, battery}),
  252 : camera,
  253 : tama5,
  254 : huc3,
  255 : huc1,
};

export const detect = function(header) {
  let cartType = dmgCarts[header[0x147]];
  if (typeof cartType === "undefined") {
    cartType = dmgCarts[0];
  }
  return cartType(header);
};
