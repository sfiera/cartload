// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import lynx from "./lynx.js";
import {pack} from "./struct.js";
import {copy, FakeClient, rand, zero} from "./testutil.js";
import {latin1, Segment, unhex} from "./util.js";

test("128kib rom", async () => {
  const data = rand(0x20000);
  const client = new LynxFakeClient(data);

  const cart = await lynx.detect(client);
  expect(cart.header.length).toBe(0x400);
  expect(cart.header).toEqual(data.slice(0, 0x400));
  expect(cart.title).toBeUndefined();
  expect(cart.code).toBeUndefined();
  expect(cart.romSize).toBe(0x20000);
  expect(cart.valid.header).toBe(true);

  const backup = await cart.backUpRom(client, null);
  expect(backup).toEqual(data);
});

class LynxFakeClient extends FakeClient {
  constructor(rom) {
    super("dmg", 5, rom);
    this.latch = 0;
    this.hiPins = 0;
  }

  read(addr) {
    addr |= this.latch << 9;
    addr &= this.rom.length - 1;
    return this.rom[addr];
  }

  write(addr, value) {}

  setPin(mask, enabled) {
    expect([0b10000, 0b00010]).toContain(mask);  // set only CLK or /CS, one at a time
    if ((this.hiPins & 0b10000) && (mask & 0b10000) && !enabled) {
      this.latch <<= 1;
      this.latch |= (this.hiPins & 0b00010) ? 1 : 0;
      this.latch &= 0xFF;
    }
    if (enabled) {
      this.hiPins |= mask;
    } else {
      this.hiPins &= ~mask;
    }
  }

  async readRange(mode, address, size, options) {
    options ||= {};
    const {csPulse, pullups} = options;

    expect(mode).toBe("dmg");
    expect(!!csPulse).toBe(false);
    expect(!!pullups).toBe(false);

    address &= 0x01FF;
    const result = [];
    for (let i = 0; i < size; ++i) {
      result.push(this.read(address++));
      address &= 0x01FF;
    }
    return result;
  }
}
