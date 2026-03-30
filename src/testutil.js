import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";

export class FakeClient {
  constructor(rom, voltage) {
    this.address = 0;
    this.rom = new Uint8Array(rom);
    this.expectedVoltage = voltage;
    this.on = false;
    this.pullups = undefined;
    this.voltage = undefined;
  }

  openBus() {
    expect(this.pullups).toBeDefined();
    return this.pullups ? 0xFF : 0x00;
  }

  async lock(priority, fn) { return await fn(this); }

  cmdSetVoltage5v() { this.voltage = 5; }
  cmdSetVoltage33v() { this.voltage = 3.3; }

  cmdCartPwrOn() {
    expect(this.voltage).toBe(this.expectedVoltage);
    this.on = true;
  }
  cmdCartPwrOff() { this.on = false; }
  cmdSetModeDmg() {}
  cmdSetModeAgb() {}
  cmdDisablePullups() {}
  cmdDmgMbcReset() {}
  cmdAgbBootupSequence() {}

  async command(cmd, ...args) {
    for (const [key, cmd2] of Object.entries(cmds)) {
      if (cmd.id == cmd2.id) {
        const fn = "cmd" + key.toLowerCase().replace(/(?:^|_)+(.)/g, (_, c) => c.toUpperCase())
        if (typeof this[fn] === "undefined") {
          throw new Error(`unimplemented command ${key}`);
        }
        return this[fn](...args);
      }
    }
    throw new Error(`unknown command ${cmd.id}`);
  }

  setCartMode(mode) {}
  setDmgReadMethod(method) {}
  setDmgAccessMode(mode) {}
  setAgbReadMethod(method) {}
  setAgbIrqEnabled(enabled) {}
  setAddress(address) {}

  async setVariable(variable, value) {
    for (const [key, variable2] of Object.entries(vars)) {
      if ((variable.id == variable2.id) && (variable.size == variable2.size)) {
        const fn = "set" + key.toLowerCase().replace(/(?:^|_)+(.)/g, (_, c) => c.toUpperCase())
        if (typeof this[fn] === "undefined") {
          throw new Error(`unimplemented variable ${key}`);
        }
        return this[fn](value);
      }
    }
    throw new Error(`unknown command ${cmd.id}`);
  }
}

export function rand(n, seed) {
  seed = seed || 1;
  const data = new Uint8Array(n);
  data.forEach((_, i) => {
    seed = (48271 * seed) % 2147483647;
    data[i] = seed;
  });
  return data;
}

export function zero(array, start, end) {
  while (start < end) {
    array[start++] = 0;
  }
}

export function copy(array, start, ...data) { data.forEach((x, i) => array[start + i] = x); }
