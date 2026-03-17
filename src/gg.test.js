// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {default as gg, shuffleAddr, unshuffleAddr} from "./gg.js";
import {copy, FakeClient, rand, zero} from "./testutil.js";
import {latin1, Segment, unhex} from "./util.js";

class GgFakeClient extends FakeClient {
  read(addr) {
    if (0 <= addr && addr < 0xC000) {
      return this.rom[addr] || 0;
    }
    return 0xFF;
  }

  write(addr, value) {}

  cmdCartPwrOn(addr) {}
  cmdCartPwrOff(addr) {}
  cmdDisablePullups() {}
  cmdDmgCartWrite(addr, value) { this.write(addr, value); }

  setAddress(value) { this.address = value & 0xFFFF; }
  setDmgReadMethod(value) {}
  setDmgAccessMode(value) {}
  setCartMode(value) {}
  setDmgReadCsPulse(value) {}

  async transfer(cmd, size, callback, ...args) {
    expect(cmd.id).toBe(cmds.DMG_CART_READ.id);
    expect(args).toHaveLength(0);
    const result = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      result[i] = this.read(unshuffleAddr(this.address++));
      this.address &= 0xFFFF;
    }
    return result;
  }
}

test("address shuffling", () => {
  expect(shuffleAddr(0x0000)).toBe(0x0000);
  expect(shuffleAddr(0xFFFF)).toBe(0xFFFF);
  expect(shuffleAddr(0x1234)).toBe(0x1059);
});

test("no mapper", async () => {
  const data = rand(0x8000);
  copy(data, 0x7FF0, ...unhex("544d5220534547410000"));  // "TMR SEGA"
  copy(data, 0x7FFA, 0xBB, 0xAA);                        // Checksum: 0xAABB
  copy(data, 0x7FFC, ...unhex("123456"));                // Product code: 53412; Version: 6
  copy(data, 0x7FFF, ...unhex("5c"));                    // Region: GG Japan; Size: 32 KiB
  const client = new GgFakeClient(data);

  const cart = await gg.detect(client);
  expect(cart.title).toBe(null);
  expect(cart.code).toBe("53412");
  expect(cart.romVersion).toBe(6);
  expect(cart.region).toBe(5);
  expect(cart.romSize).toBe(32768);
  expect(cart.valid.trademark).toBe(true);

  const backup = await cart.backUpRom(client);
  expect(backup).toEqual(data);
});
