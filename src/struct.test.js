// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import {pack, unpack} from "./struct.js";

const b = (...bytes) => new Uint8Array([...bytes]);

test("ints and uints", () => {
  expect(pack("b", 0x12)).toStrictEqual(b(0x12));
  expect(pack("B", 0x12)).toStrictEqual(b(0x12));
  expect(unpack("b", b(0x12))).toStrictEqual([0x12]);
  expect(unpack("B", b(0x12))).toStrictEqual([0x12]);

  expect(pack("h", 0x1234)).toStrictEqual(b(0x12, 0x34));
  expect(pack("H", 0x1234)).toStrictEqual(b(0x12, 0x34));
  expect(unpack("h", b(0x12, 0x34))).toStrictEqual([0x1234]);
  expect(unpack("H", b(0x12, 0x34))).toStrictEqual([0x1234]);

  expect(pack("i", 0x12345678)).toStrictEqual(b(0x12, 0x34, 0x56, 0x78));
  expect(pack("I", 0x12345678)).toStrictEqual(b(0x12, 0x34, 0x56, 0x78));
  expect(unpack("i", b(0x12, 0x34, 0x56, 0x78))).toStrictEqual([0x12345678]);
  expect(unpack("I", b(0x12, 0x34, 0x56, 0x78))).toStrictEqual([0x12345678]);

  expect(pack("b", -1)).toStrictEqual(b(0xff));
  expect(unpack("b", b(0xff))).toStrictEqual([-1]);
  expect(pack("h", -1)).toStrictEqual(b(0xff, 0xff));
  expect(unpack("h", b(0xff, 0xff))).toStrictEqual([-1]);
  expect(pack("i", -1)).toStrictEqual(b(0xff, 0xff, 0xff, 0xff));
  expect(unpack("i", b(0xff, 0xff, 0xff, 0xff))).toStrictEqual([-1]);

  expect(unpack("bhiIHB", b(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14)))
      .toStrictEqual([0x01, 0x0203, 0x04050607, 0x08090a0b, 0x0c0d, 0x0e]);
  expect(pack("bhiIHB", 0x01, 0x0203, 0x04050607, 0x08090a0b, 0x0c0d, 0x0e))
      .toStrictEqual(b(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14));
});

test("bools", () => {
  expect(pack("?", false)).toStrictEqual(b(0x00));
  expect(pack("?", true)).toStrictEqual(b(0x01));
  expect(unpack("?", b(0x00))).toStrictEqual([false]);
  expect(unpack("?", b(0x01))).toStrictEqual([true]);
  expect(() => unpack("?", b(0x02))).toThrow(Error);
})

test("pstring", () => {
  expect(unpack("pp", b(3, 1, 2, 3, 4, 5, 6, 7, 8)))
      .toStrictEqual([b(0x01, 0x02, 0x03), b(0x05, 0x06, 0x07, 0x08)]);
});
