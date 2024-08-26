import * as dmg from "./dmg.js";
import {latin1, Segment, unhex} from "./util.js";

const nintendoLogo = new Uint8Array([
  0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B, 0x03, 0x73, 0x00, 0x83,
  0x00, 0x0C, 0x00, 0x0D, 0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
  0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99, 0xBB, 0xBB, 0x67, 0x63,
  0x6E, 0x0E, 0xEC, 0xCC, 0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E,
]);

test("no mapper", () => {
  const header = new Array(0x180);
  header.splice(0x104, 0x30, nintendoLogo);
  header.splice(0x134, 6, ...unhex("544554524953")); // Title: TETRIS
  header.splice(0x14B, 1, 0x01);                     // Old licensee: Nintendo
  header.splice(0x14C, 1, 0x01);                     // ROM version: 1
  header.splice(0x14D, 1, 0x0a);                     // Header checksum: $0A
  header.splice(0x14E, 2, 0x16, 0xbf);               // Global checksum: $16BF

  const cart = dmg.detect(new Uint8Array(header));
  expect(cart.title).toStrictEqual("TETRIS");
  expect(cart.romSize).toBe(32768);
  expect(cart.ramSize).toBe(0);
  expect(cart.validHeader).toBe(true);
});

const rom4 = [
  new Segment(0, 16384),
  new Segment(16384, 32768),
  new Segment(32768, 49152),
  new Segment(49152, 65536),
];
const ram4 = [
  new Segment(0, 8192),
  new Segment(8192, 16384),
  new Segment(16384, 24576),
  new Segment(24576, 32768),
];

test.each([
  [ 0x00, "None", 32768, [ new Segment(0, 32768) ], 0, [] ],
  //[ 0x01, "MBC1", 65536, rom4, 32768, ram4 ],
])("mapper $id rom and ram sizes",
   (id, mapper, romSize, romSegments, ramSize, ramSegments) => {
     const header = new Array(0x180);
     header.splice(0x147, 1, id);
     header.splice(0x148, 1, 0x01); // ROM size: 64 KiB (4 banks)
     header.splice(0x149, 1, 0x03); // RAM size: 8 KiB (4 banks)

     const cart = dmg.detect(new Uint8Array(header));
     expect(cart.mapperName).toBe(mapper);
     expect(cart.romSize).toBe(romSize);
     expect(cart.romSegments).toStrictEqual(romSegments);
     expect(cart.ramSize).toBe(ramSize);
     expect(cart.ramSegments).toStrictEqual(ramSegments);
   });

test.each([
  {
    data : unhex("54455452495300000000000000000000"),
    title : "TETRIS",
  },
  {
    data : unhex("47414d45424f592047414c4c45525932"),
    title : "GAMEBOY GALLERY2",
  },
  {
    data : unhex("4d474200000000000000000000000080"),
    title : "MGB",
    cgbFlag : 0x80,
  },
  {
    data : unhex("534841444f574741544520434c415380"),
    title : "SHADOWGATE CLAS",
    mfrCode : "", // C is not a valid cartridge type
    cgbFlag : 0x80
  },
  {
    data : unhex("574152494f4c414e44330041573841c0"),
    title : "WARIOLAND3",
    mfrCode : "AW8A",
    cgbFlag : 0xc0,
  },
  {
    data : unhex("54494e54494e2d5052495342545450c0"),
    title : "TINTIN-PRIS",
    mfrCode : "BTTP",
    cgbFlag : 0xc0,
  },
  {
    data : unhex("46414d494c5947423200004846324ac0"),
    title : "FAMILYGB2",
    mfrCode : "HF2J",
    cgbFlag : 0xc0,
  },
  {
    data : unhex("4b4f524f32204b495242594b4b4b4ac0"),
    title : "KORO2 KIRBY",
    mfrCode : "KKKJ",
    cgbFlag : 0xc0,
  },
  {
    data : unhex("534e4f43524f535300000056505345c0"),
    title : "SNOCROSS",
    mfrCode : "VPSE",
    cgbFlag : 0xc0,
  }
])("title $title", ({data, title, mfrCode = "", cgbFlag = 0}) => {
  const header = new Array(0x180);
  header.splice(0x134, data.length, ...data);

  const cart = dmg.detect(new Uint8Array(header));
  expect(cart.title).toStrictEqual(title);
  expect(cart.mfrCode).toStrictEqual(mfrCode);
  expect(cart.cgbFlag).toStrictEqual(cgbFlag);
});
