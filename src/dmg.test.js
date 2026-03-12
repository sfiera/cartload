// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {latin1, Segment, unhex} from "./util.js";

const logoBits = unhex(
    "ceed6666cc0d000b03730083000c000d0008111f8889000e" +
    "dccc6ee6ddddd999bbbb67636e0eecccdddc999fbbb9333e");

const logoGfx = [
  "██   ██ ██                             ██       ",
  "███  ██ ██        ██                   ██       ",
  "███  ██          ████                  ██       ",
  "██ █ ██ ██ ██ ██  ██  ████  ██ ██   █████  ████ ",
  "██ █ ██ ██ ███ ██ ██ ██  ██ ███ ██ ██  ██ ██  ██",
  "██  ███ ██ ██  ██ ██ ██████ ██  ██ ██  ██ ██  ██",
  "██  ███ ██ ██  ██ ██ ██     ██  ██ ██  ██ ██  ██",
  "██   ██ ██ ██  ██ ██  █████ ██  ██  █████  ████ ",
].join("\n");

function rand(n, seed) {
  seed = seed || 1;
  const data = new Uint8Array(n);
  data.forEach((_, i) => {
    seed = (48271 * seed) % 2147483647;
    data[i] = seed;
  });
  return data;
}

function zero(array, start, end) {
  while (start < end) {
    array[start++] = 0;
  }
}

function copy(array, start, ...data) { data.forEach((x, i) => array[start + i] = x); }

class FakeClient {
  constructor(rom, ram) {
    this.address = 0;
    this.rom = new Uint8Array(rom);
    this.ram = new Uint8Array(ram);
  }

  read(addr) {
    if (0 <= addr && addr < 0x8000) {
      return this.rom[addr] || 0;
    } else if (0xA000 <= addr && addr < 0xC000) {
      return this.ram[addr] || 0;
    }
    return 0xFF;
  }

  write(addr, value) {}

  async command(cmd, ...args) {
    if (cmd === cmds.CART_PWR_ON) {
    } else if (cmd === cmds.CART_PWR_OFF) {
    } else if (cmd === cmds.DISABLE_PULLUPS) {
    } else if (cmd === cmds.DMG_CART_WRITE) {
      const [addr, value] = args;
      this.write(addr, value);
    } else {
      expect(cmd).toEqual(null);
    }
  }

  async setVariable(variable, value) {
    if (variable === vars.ADDRESS) {
      this.address = value & 0xFFFF;
    } else if (variable === vars.DMG_READ_METHOD) {
    } else if (variable === vars.DMG_ACCESS_MODE) {
    } else if (variable === vars.CART_MODE) {
    } else if (variable === vars.DMG_READ_CS_PULSE) {
    } else {
      expect(variable).toEqual(null);
    }
  }

  async transfer(cmd, size, callback, ...args) {
    expect(cmd.id).toBe(cmds.DMG_CART_READ.id);
    expect(args).toHaveLength(0);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(this.address++);
      this.address &= 0xFFFF;
    }
    expect(this.address).toBeLessThan(0x8001);
    return result;
  }
}

class FakeMBC1Client extends FakeClient {
  constructor(rom, ram, {multicart = false}) {
    super(rom, ram);
    this.ramEnabled = false;
    this.romBank = 1;
    this.ramBank = 0;
    this.mode = 0;
    this.multicart = multicart;
  }

  read(addr) {
    if (0 <= addr && addr < 0x8000) {
      const upper = addr >= 0x4000;
      addr &= 0x3FFF;
      if (this.mode || upper) {
        addr += this.ramBank << (this.multicart ? 18 : 19);
      }
      if ((this.mode && this.multicart) || upper) {
        addr += this.romBank << 14;
      }
      return this.rom[addr % this.rom.length];
    } else if (0xA000 <= addr && addr < 0xC000) {
      if (this.ramEnabled) {
        addr = (this.ramBank << 13) + (addr & 0x1FFF);
        return this.ram[addr % this.ram.length];
      }
    }
    return 0xFF;
  }

  write(addr, value) {
    if (0 <= addr && addr < 0x2000) {
      this.ramEnabled = (value & 0x0F) == 0x0A;
    } else if (0x2000 <= addr && addr < 0x4000) {
      this.romBank = (value & 0x1F) || 1;
      if (this.multicart) {
        this.romBank &= 0x0F;
      }
    } else if (0x4000 <= addr && addr < 0x6000) {
      this.ramBank = value & 3;
    } else if (0x6000 <= addr && addr < 0x8000) {
      this.mode = value & 1;
    } else if (0xA000 <= addr && addr < 0xC000) {
      if (this.ramEnabled) {
        addr = (this.ramBank << 13) + (addr & 0x1FFF);
        this.ram[addr % this.ram.length] = value;
      }
    }
  }
}

test("draw logo", async () => {
  const data = rand(0x8000);
  copy(data, 0x104, ...logoBits);
  const cart = await dmg.detect(new FakeClient(data));
  const logo = Array(8).fill(0).map(_ => Array(48).fill(" "));
  const ctx = {
    fillRect: (x, y, w, h) => {
      expect(w).toEqual(1);
      expect(h).toEqual(1);
      expect(ctx.fillStyle).toEqual("black");
      logo[y][x] = "█";
    },
  };
  cart.drawImage(ctx);
  expect(logo.map(row => row.join("")).join("\n")).toEqual(logoGfx);
});

test("no mapper", async () => {
  const data = rand(0x8000);
  zero(data, 0x104, 0x150);
  copy(data, 0x104, ...logoBits);
  copy(data, 0x134, ...unhex("544554524953"));  // Title: TETRIS
  copy(data, 0x14B, 0x01);                      // Old licensee: Nintendo
  copy(data, 0x14C, 0x01);                      // ROM version: 1
  copy(data, 0x14D, 0x0a);                      // Header checksum: $0A
  copy(data, 0x14E, 0x16, 0xbf);                // Global checksum: $16BF
  const client = new FakeClient(data);

  const cart = await dmg.detect(client);
  expect(cart.title).toStrictEqual("TETRIS");
  expect(cart.romSize).toBe(32768);
  expect(cart.savSize).toBe(0);
  expect(cart.valid.header).toBe(true);

  const backup = await cart.backUpRom(client, null);
  expect(backup).toEqual(data);
});

const rom1 = [new Segment(0, 32768)];
const rom4 = [
  new Segment(0, 16384),
  new Segment(16384, 32768),
  new Segment(32768, 49152),
  new Segment(49152, 65536),
];
const sav1 = [new Segment(0, 8192)];
const sav4 = [
  new Segment(0, 8192),
  new Segment(8192, 16384),
  new Segment(16384, 24576),
  new Segment(24576, 32768),
];

test.each([
  [0x00, "None", 32768, rom1, 0, [], []],
  [0x08, "None", 32768, rom1, 0, [], ["ram"]],
  [0x09, "None", 32768, rom1, 8192, sav1, ["battery", "ram"]],

  [0x01, "MBC1", 65536, rom4, 0, [], []],
  [0x02, "MBC1", 65536, rom4, 0, [], ["ram"]],
  [0x03, "MBC1", 65536, rom4, 32768, sav4, ["battery", "ram"]],

  [0x05, "MBC2", 65536, rom4, 0, [], []],
  [0x06, "MBC2", 65536, rom4, 512, [new Segment(0, 512)], ["battery"]],

  [0x0F, "MBC3", 65536, rom4, 0, [], ["battery", "timer"]],
  [0x10, "MBC3", 65536, rom4, 32768, sav4, ["battery", "ram", "timer"]],
  [0x11, "MBC3", 65536, rom4, 0, [], []],
  [0x12, "MBC3", 65536, rom4, 0, [], ["ram"]],
  [0x13, "MBC3", 65536, rom4, 32768, sav4, ["battery", "ram"]],

  [0x19, "MBC5", 65536, rom4, 0, [], []],
  [0x1A, "MBC5", 65536, rom4, 0, [], ["ram"]],
  [0x1B, "MBC5", 65536, rom4, 32768, sav4, ["battery", "ram"]],
  [0x1C, "MBC5", 65536, rom4, 0, [], ["rumble"]],
  [0x1D, "MBC5", 65536, rom4, 0, [], ["ram", "rumble"]],
  [0x1E, "MBC5", 65536, rom4, 32768, sav4, ["battery", "ram", "rumble"]],

  // [ 0x20, "MBC6", 65536, rom4, 32768, sav4, [] ],
  // [ 0x22, "MBC7", 65536, rom4, 32768, sav4, [] ],

  // [ 0x0B, "MMM01", 65536, rom4, 32768, sav4, [] ],
  // [ 0x0C, "MMM01", 65536, rom4, 32768, sav4, [ "ram" ] ],
  // [ 0x0D, "MMM01", 65536, rom4, 32768, sav4, [ "battery", "ram" ] ],

  [0xFC, "MAC-GBD", 65536, rom4, 32768, sav4, ["battery", "camera", "ram"]],
  // [ 0xFD, "Tama5", 65536, rom4, 32768, sav4, [ "battery", "ram" ] ],
  [0xFE, "HuC-3", 65536, rom4, 32768, sav4, ["battery", "infrared", "ram", "speaker", "timer"]],
  [0xFF, "HuC-1", 65536, rom4, 32768, sav4, ["battery", "infrared", "ram"]],

  [0xF0, "None", 32768, rom1, 0, [], []],  // unknown → no mapper/features
])("cartridge type %d (%s) rom and sav",
   async (id, mapper, romSize, romSegments, savSize, savSegments, features) => {
     const header = new Array(0x180);
     header.splice(0x147, 1, id);
     header.splice(0x148, 1, 0x01);  // ROM size: 64 KiB (4 banks)
     header.splice(0x149, 1, 0x03);  // RAM size: 8 KiB (4 banks)

     const cart = await dmg.detect(new FakeClient(header));
     expect(cart.mapperName).toBe(mapper);
     expect(cart.romSize).toBe(romSize);
     expect(cart.romSegments).toStrictEqual(romSegments);
     expect(cart.savSize).toBe(savSize);
     expect(cart.savSegments).toStrictEqual(savSegments);

     const kv = Object.entries(cart.features);
     expect(kv.filter(([k, v]) => v).map(([k, v]) => k).sort()).toStrictEqual(features);
   });

test.each([
  {
    data: unhex("54455452495300000000000000000000"),
    title: "TETRIS",
  },
  {
    data: unhex("47414d45424f592047414c4c45525932"),
    title: "GAMEBOY GALLERY2",
  },
  {
    data: unhex("4d474200000000000000000000000080"),
    title: "MGB",
    cgbFlag: 0x80,
  },
  {
    data: unhex("534841444f574741544520434c415380"),
    title: "SHADOWGATE CLAS",
    code: "",  // C is not a valid cartridge type
    cgbFlag: 0x80,
  },
  {
    data: unhex("574152494f4c414e44330041573841c0"),
    title: "WARIOLAND3",
    code: "AW8A",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("54494e54494e2d5052495342545450c0"),
    title: "TINTIN-PRIS",
    code: "BTTP",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("46414d494c5947423200004846324ac0"),
    title: "FAMILYGB2",
    code: "HF2J",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("4b4f524f32204b495242594b4b4b4ac0"),
    title: "KORO2 KIRBY",
    code: "KKKJ",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("534e4f43524f535300000056505345c0"),
    title: "SNOCROSS",
    code: "VPSE",
    cgbFlag: 0xc0,
  },
])("title $title", async ({data, title, code = "", cgbFlag = 0}) => {
  const header = new Array(0x180);
  header.splice(0x134, data.length, ...data);

  const cart = await dmg.detect(new FakeClient(header));
  expect(cart.title).toStrictEqual(title);
  expect(cart.code).toStrictEqual(code);
  expect(cart.cgbFlag).toStrictEqual(cgbFlag);
});
