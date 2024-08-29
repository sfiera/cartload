import {hex, unhex} from "./util.js";

const b = (...bytes) => new Uint8Array([...bytes]);

test("hex", () => {
  expect(hex(b())).toBe("");
  expect(hex(b(0))).toBe("00");
  expect(hex(b(0x12, 0x34))).toBe("1234");
})

test("unhex", () => {
  expect(unhex("00")).toStrictEqual(b(0));
  expect(unhex("1234")).toStrictEqual(b(0x12, 0x34));
  expect(unhex("1234 5678")).toStrictEqual(b(0x12, 0x34, 0x56, 0x78));
})
