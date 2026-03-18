// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {addr as addrConv, default as gg} from "./gg.js";
import {pack} from "./struct.js";
import {copy, FakeClient, rand, zero} from "./testutil.js";
import {latin1, Segment, unhex} from "./util.js";

class GgFakeClient extends FakeClient {
  constructor(rom) {
    super(rom);
    this.banks = [0, 1, 2];
  }

  read(addr) {
    if (this.rom.length >= 0x10000) {
      const bank = this.banks[addr >>> 14];
      if (typeof bank !== "number") {
        return 0xFF;
      }
      addr &= 0x3FFF;
      addr |= bank << 14;
      addr &= this.rom.length - 1;
    } else {
      if (addr >= this.rom.length) {
        return 0xFF;
      }
    }
    return this.rom[addr];
  }

  write(addr, value) {
    addr = addrConv.boyToGear(addr);
    switch (addr) {
      case 0xFFFC:
        expect(value).toBe(0);
        break;
      case 0xFFFD:
        this.banks[0] = value;
        break;
      case 0xFFFE:
        this.banks[1] = value;
        break;
      case 0xFFFF:
        this.banks[2] = value;
        break;
    }
  }

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
      result[i] = this.read(addrConv.boyToGear(this.address++));
      this.address &= 0xFFFF;
    }
    return result;
  }
}

test("address shuffling", () => {
  expect(addrConv.gearToBoy(0x0000)).toBe(0x0000);
  expect(addrConv.gearToBoy(0xFFFF)).toBe(0xFFFF);
  expect(addrConv.gearToBoy(0x1234)).toBe(0x1059);
  expect(addrConv.boyToGear(0x0000)).toBe(0x0000);
  expect(addrConv.boyToGear(0xFFFF)).toBe(0xFFFF);
  expect(addrConv.boyToGear(0x1059)).toBe(0x1234);

  expect(addrConv.boyToGear(0x01FF)).toBe(0x10FF);
  expect(addrConv.boyToGear(0x0200)).toBe(0x0400);
  expect(addrConv.boyToGear(0x7A00)).toBe(0x2F00);
  expect(addrConv.boyToGear(0x8400)).toBe(0xC000);
});

test("header", async () => {
  const data = rand(0x8000);
  copy(data, 0x7FF0, ...unhex("544d5220534547410000"));  // "TMR SEGA"
  copy(data, 0x7FFA, ...pack("<H", 0xAABB));             // Checksum: 0xAABB
  copy(data, 0x7FFC, ...pack("<I", 0x563412));           // Product code: 53412; Version: 6
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
  expect(backup.slice(1024)).toEqual(data.slice(1024));
});

test.each([
  {size: 0x8000},
  // {size: 0xc000},
  {size: 0x10000},
  {size: 0x20000},
])("size $size", async ({size}) => {
  const data = rand(size);
  const client = new GgFakeClient(data);

  const cart = await gg.detect(client);
  expect(cart.romSize).toBe(size);

  const backup = await cart.backUpRom(client);
  expect(backup).toEqual(data);
});
