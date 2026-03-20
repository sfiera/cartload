// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {latin1} from "./util.js";

const MAX_TRANSFER_SIZE = 64;

export default class Client {
  constructor(port) {
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.working = false;
    this.queue = [];
  }

  async #work() {
    while (!this.working && this.queue.length) {
      const {resolve, reject, fn} = this.queue.shift();
      this.working = true;
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      } finally {
        this.working = false;
      }
    }
  }

  #serialize(fn) {
    const {promise, resolve, reject} = Promise.withResolvers();
    this.queue.push({resolve, reject, fn});
    this.#work();
    return promise;
  }

  static async open(port) {
    await port.open({baudRate: 1000000});
    return new Client(port);
  }

  async close() {
    await this.reader.releaseLock();
    await this.writer.releaseLock();
    await this.port.close();
  }

  async #command(cmd, ...args) {
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

  async #transfer(cmd, size, callback, ...args) {
    let result = [];
    if (size >= MAX_TRANSFER_SIZE) {
      await this.#setVariable(vars.TRANSFER_SIZE, MAX_TRANSFER_SIZE);
      while (size >= MAX_TRANSFER_SIZE) {
        await this.#transferChunk(cmd, result, MAX_TRANSFER_SIZE, ...args);
        size -= MAX_TRANSFER_SIZE;
        if (callback) {
          callback(result.length);
        }
      }
    }
    if (size > 0) {
      await this.#setVariable(vars.TRANSFER_SIZE, size);
      await this.#transferChunk(cmd, result, size, ...args);
      if (callback) {
        callback(result.length);
      }
    }
    return result;
  }

  async #transferChunk(cmd, result, size, ...args) {
    await this.#command(cmd, ...args);
    while (size > 0) {
      let data = (await this.reader.read()).value;
      result.push(...data);
      size -= data.length;
    }
  }

  async #getVariable(variable) {
    return await this.#command(cmds.GET_VARIABLE, variable.size, variable.id);
  }

  async #setVariable(variable, value) {
    return await this.#command(cmds.SET_VARIABLE, variable.size, variable.id, value);
  }

  async #identify() {
    const [ofwPcbVer] = await this.#command(cmds.OFW_PCB_VER);
    const [ofwFwVer] = await this.#command(cmds.OFW_FW_VER);

    if ((ofwPcbVer < 5) || (ofwFwVer == 0)) {
      throw new Error("unsupported ofw version", ofwPcbVer, ofwFwVer);
    }

    const [info, nameEnc, cartPowerCtrl, bootloaderReset] =
        await this.#command(cmds.QUERY_FW_INFO);
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

  async command(cmd, ...args) {
    return await this.#serialize(async () => await this.#command(cmd, ...args));
  }

  async transfer(cmd, size, callback, ...args) {
    return this.#serialize(async () => this.#transfer(cmd, size, callback, ...args));
  }

  async identify() { return this.#serialize(async () => this.#identify()); }

  async getVariable(variable) {
    return await this.#serialize(async () => this.#getVariable(variable));
  }

  async setVariable(variable, value) {
    return await this.#serialize(async () => this.#setVariable(variable, value));
  }
}
