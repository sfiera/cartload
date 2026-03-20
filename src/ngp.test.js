// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import ngp from "./ngp.js";
import {pack} from "./struct.js";
import {copy, FakeClient, rand, zero} from "./testutil.js";
import {latin1, Segment, unhex} from "./util.js";

test("no mapper", async () => {
  const data = rand(0x10000);
  copy(data, 0, ...unhex("204c4943454e53454420425920534e4b20434f52504f524154494f4e"));
  copy(data, 0x1C, ...pack("<I", 0x200100));               // Startup address: 0x200100
  copy(data, 0x20, ...pack("<H", 0x0052));                 // Code: BCD 0052
  copy(data, 0x22, 0x03);                                  // Sub-code: 3
  copy(data, 0x23, 0x10);                                  // Compatibility: Color
  copy(data, 0x24, ...unhex("48414e41424920312e303220"));  // Title: HANABI 1.02
  zero(data, 0x30, 0x10);
  const client = new NgpFakeClient(data);

  const cart = await ngp.detect(client);
  expect(cart.header.length).toBe(0x40);
  expect(cart.title).toBe("HANABI 1.02 ");
  expect(cart.code).toBe("NEOP0052");
  expect(cart.romSize).toBe(65536);
  expect(cart.valid.trademark).toBe(true);
  expect(cart.compatibility.color).toBe(true);
});

test.each([
  {
    data: unhex("204c4943454e53454420425920534e4b20434f52504f524154494f4e"),
    trademark: " LICENSED BY SNK CORPORATION",
    valid: true,
  },
  {
    data: unhex("434f5059524947485420425920534e4b20434f52504f524154494f4e"),
    trademark: "COPYRIGHT BY SNK CORPORATION",
    valid: true,
  },
  {
    data: unhex("504952415445442046524f4d20534e4b20434f52504f524154494f4e2e"),
    trademark: "PIRATED FROM SNK CORPORATION",
    valid: false,
  },
])("trademark $trademark", async ({data, trademark, valid}) => {
  const header = new Array(0x180).fill(0);
  copy(header, 0x00, ...data);

  const cart = await ngp.detect(new NgpFakeClient(header));
  expect(cart.trademark).toStrictEqual(trademark);
  expect(cart.valid.header).toStrictEqual(valid);
});

class NgpFakeClient extends FakeClient {
  constructor(rom) {
    super(rom);
    this.latch = 0;
    this.hiPins = 0;
  }

  read(addr) {
    addr |= this.latch << 16;
    addr &= this.rom.length - 1;
    return this.rom[addr];
  }

  write(addr, value) {}

  cmdSetPin(mask, enabled) {
    if ((this.hiPins & 0b00010) && (mask & 0b00010) && !enabled) {
      expect(mask & (0xFF << 5)).toBe(0);  // don't change address pins while latching
      this.latch = (this.hiPins >>> 6) & 0b11111;
    }
    if (enabled) {
      this.hiPins |= mask;
    } else {
      this.hiPins &= ~mask;
    }
  }

  async transfer(mode, address, size, options) {
    options ||= {};
    const {csPulse, pullups} = options;

    expect(mode).toBe("dmg");
    expect(!!csPulse).toBe(false);
    expect(!!pullups).toBe(false);
    expect(this.hiPins & (0xFF << 5)).toBe(0);  // All address pins low
    expect(this.hiPins & 0b10100).toBe(0);      // CS and RD low

    address &= 0xFFFF;
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(address++);
      address &= 0xFFFF;
    }
    return result;
  }
}
