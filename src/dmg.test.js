import * as dmg from "./dmg.js";
import {latin1, Segment, unhex} from "./util.js";

const nintendoLogo = new Uint8Array([
  0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D,
  0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E, 0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99,
  0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC, 0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
]);

test("no mapper", () => {
  const header = new Array(0x180);
  header.splice(0x104, 0x30, ...nintendoLogo);
  header.splice(0x134, 6, ...unhex("544554524953"));  // Title: TETRIS
  header.splice(0x14B, 1, 0x01);                      // Old licensee: Nintendo
  header.splice(0x14C, 1, 0x01);                      // ROM version: 1
  header.splice(0x14D, 1, 0x0a);                      // Header checksum: $0A
  header.splice(0x14E, 2, 0x16, 0xbf);                // Global checksum: $16BF

  const cart = dmg.detect(new Uint8Array(header));
  expect(cart.title).toStrictEqual("TETRIS");
  expect(cart.romSize).toBe(32768);
  expect(cart.savSize).toBe(0);
  expect(cart.valid.header).toBe(true);
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
   (id, mapper, romSize, romSegments, savSize, savSegments, features) => {
     const header = new Array(0x180);
     header.splice(0x147, 1, id);
     header.splice(0x148, 1, 0x01);  // ROM size: 64 KiB (4 banks)
     header.splice(0x149, 1, 0x03);  // RAM size: 8 KiB (4 banks)

     const cart = dmg.detect(new Uint8Array(header));
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
    mfrCode: "",  // C is not a valid cartridge type
    cgbFlag: 0x80,
  },
  {
    data: unhex("574152494f4c414e44330041573841c0"),
    title: "WARIOLAND3",
    mfrCode: "AW8A",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("54494e54494e2d5052495342545450c0"),
    title: "TINTIN-PRIS",
    mfrCode: "BTTP",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("46414d494c5947423200004846324ac0"),
    title: "FAMILYGB2",
    mfrCode: "HF2J",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("4b4f524f32204b495242594b4b4b4ac0"),
    title: "KORO2 KIRBY",
    mfrCode: "KKKJ",
    cgbFlag: 0xc0,
  },
  {
    data: unhex("534e4f43524f535300000056505345c0"),
    title: "SNOCROSS",
    mfrCode: "VPSE",
    cgbFlag: 0xc0,
  },
])("title $title", ({data, title, mfrCode = "", cgbFlag = 0}) => {
  const header = new Array(0x180);
  header.splice(0x134, data.length, ...data);

  const cart = dmg.detect(new Uint8Array(header));
  expect(cart.title).toStrictEqual(title);
  expect(cart.mfrCode).toStrictEqual(mfrCode);
  expect(cart.cgbFlag).toStrictEqual(cgbFlag);
});
