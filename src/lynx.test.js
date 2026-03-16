// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import * as lynx from "./lynx.js";
import {pack} from "./struct.js";
import {copy, FakeClient, rand, zero} from "./testutil.js";
import {latin1, Segment, unhex} from "./util.js";

test("128kib rom", async () => {
  const data = rand(0x20000);
  const client = new LynxFakeClient(data);

  const cart = await lynx.detect(client);
  expect(cart.header.length).toBe(0x200);
  expect(cart.header).toEqual(data.slice(0, 0x200));
  expect(cart.title).toBeNull();
  expect(cart.code).toBeNull();
  expect(cart.romSize).toBe(0x20000);
  expect(cart.valid.header).toBe(true);

  const backup = await cart.backUpRom(client, null);
  expect(backup).toEqual(data);
});

class LynxFakeClient extends FakeClient {
  constructor(rom) {
    super(rom);
    this.latch = 0;
    this.hiPins = 0;
  }

  read(addr) {
    addr |= this.latch << 9;
    addr &= this.rom.length - 1;
    return this.rom[addr];
  }

  write(addr, value) {}

  cmdCartPwrOn() {}
  cmdCartPwrOff() {}
  cmdDisablePullups() {}

  cmdSetPin(mask, enabled) {
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

  setAddress(value) { this.address = value & 0x01FF; }
  setDmgReadMethod(value) {}
  setDmgAccessMode(value) {}
  setCartMode(value) {}
  setDmgReadCsPulse(value) { expect(value).toBe(0); }

  async transfer(cmd, size, callback, ...args) {
    expect(cmd.id).toBe(cmds.DMG_CART_READ.id);
    expect(args).toHaveLength(0);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(this.address++);
      this.address &= 0x01FF;
    }
    return result;
  }
}
