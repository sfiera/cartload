// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {latin1} from "./util.js";

const MAX_TRANSFER_SIZE = 64;

class LockedClient {
  constructor(port) {
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
  }

  async close() {
    await this.reader.releaseLock();
    await this.writer.releaseLock();
    await this.port.close();
  }

  async command(cmd, ...args) {
    await this.writer.write(pack(cmd.reqFormat, cmd.id, ...args));
    if (!cmd.respFormat.length) {
      return [];
    }
    let data = new Array();
    while (true) {
      let readData = await this.reader.read();
      data.push(...readData.value);
      try {
        return unpack(cmd.respFormat, new Uint8Array(data));
      } catch (e) {
        if (e.message != "data underflow") {
          throw e;
        }
      }
      if (readData.done) {
        throw new Error("EOF");
      }
    }
  }

  async getVariable(variable) {
    return await this.command(cmds.GET_VARIABLE, variable.size, variable.id);
  }

  async setVariable(variable, value) {
    return await this.command(cmds.SET_VARIABLE, variable.size, variable.id, value);
  }

  async setPin(mask, value) { return await this.command(cmds.SET_PIN, mask, value ? 1 : 0); }

  async #transferAll(cmd, size, callback, ...args) {
    let result = [];
    if (size >= MAX_TRANSFER_SIZE) {
      await this.setVariable(vars.TRANSFER_SIZE, MAX_TRANSFER_SIZE);
      while (size >= MAX_TRANSFER_SIZE) {
        await this.#transferChunk(cmd, result, MAX_TRANSFER_SIZE, ...args);
        size -= MAX_TRANSFER_SIZE;
        callback(result.length);
      }
    }
    if (size > 0) {
      await this.setVariable(vars.TRANSFER_SIZE, size);
      await this.#transferChunk(cmd, result, size, ...args);
      callback(result.length);
    }
    return result;
  }

  async #transferChunk(cmd, result, size, ...args) {
    await this.command(cmd, ...args);
    while (size > 0) {
      let data = (await this.reader.read()).value;
      result.push(...data);
      size -= data.length;
    }
  }

  async #transferDmg(address, size, {progress, csPulse}) {
    await this.setVariable(vars.CART_MODE, 1);
    await this.setVariable(vars.DMG_READ_METHOD, 1);
    await this.setVariable(vars.DMG_ACCESS_MODE, 1);
    await this.setVariable(vars.DMG_READ_CS_PULSE, csPulse ? 1 : 0);
    await this.setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.DMG_CART_READ, size, progress);
  }

  async #transferAgb(address, size, {progress}) {
    await this.setVariable(vars.CART_MODE, 2);
    await this.setVariable(vars.AGB_READ_METHOD, 2);
    await this.setVariable(vars.ADDRESS, address >>> 1);
    return await this.#transferAll(cmds.AGB_CART_READ, size, progress);
  }

  async #transferEep(address, size, {progress}) {
    await this.setVariable(vars.ADDRESS, address);
    return await this.#transferAll(cmds.DMG_MBC7_READ_EEPROM, size, progress);
  }

  async transfer(mode, address, size, options) {
    options ||= {};
    options.progress ||= () => {};
    const {pullups} = options;

    if (pullups) {
      await this.command(cmds.ENABLE_PULLUPS);
    } else {
      await this.command(cmds.DISABLE_PULLUPS);
    }

    switch (mode) {
      case "dmg":
        return this.#transferDmg(address, size, options);
      case "agb":
        return this.#transferAgb(address, size, options);
      case "eep":
        return this.#transferEep(address, size, options);
      default:
        throw new Error(`invalid transfer mode ${mode}`);
    }
  }

  async identify() {
    const [ofwPcbVer] = await this.command(cmds.OFW_PCB_VER);
    const [ofwFwVer] = await this.command(cmds.OFW_FW_VER);

    if ((ofwPcbVer < 5) || (ofwFwVer == 0)) {
      throw new Error("unsupported ofw version", ofwPcbVer, ofwFwVer);
    }

    const [info, nameEnc, cartPowerCtrl, bootloaderReset] = await this.command(cmds.QUERY_FW_INFO);
    const [cfwID, fwVer, pcbVer, fwTs] = unpack("BHBI", info);
    const fwDate = new Date(fwTs * 1000);
    const name = latin1.decode(nameEnc).replaceAll("\u0000", "");
    if (fwVer < 12) {
      throw new Error("unsupported fw version", fwVer);
    } else if (!cartPowerCtrl) {
      throw new Error("cartridge reset not supported");
    }

    return {cfwID, fwVer, pcbVer, fwDate, name, cartPowerCtrl, bootloaderReset};
  }
}

export default class Client {
  constructor(port) {
    this.locked = new LockedClient(port);
    this.working = false;
    this.queue = [];
  }

  async #work() {
    while (!this.working && this.queue.length) {
      const n = this.queue.slice(1).reduce(
          (i, _, j) => (this.queue[i].priority < this.queue[j].priority) ? i : j, 0);
      const {resolve, reject, fn} = this.queue[n];
      this.queue.splice(n, 1);
      this.working = true;
      try {
        const result = await fn(this.locked);
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        this.working = false;
      }
    }
  }

  lock(priority, fn) {
    const {promise, resolve, reject} = Promise.withResolvers();
    this.queue.push({resolve, reject, fn, priority});
    this.#work();
    return promise;
  }

  static async open(port) {
    await port.open({baudRate: 1000000});
    return new Client(port);
  }
}
