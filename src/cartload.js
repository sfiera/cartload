import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import {pack, unpack} from "./struct.js";
import {hex, latin1, unitBytes} from "./util.js";

const Client = class {
  constructor(port) {
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
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

  async transfer(cmd, size, ...args) {
    await this.setVariable(vars.TRANSFER_SIZE, size);
    await this.command(cmd, ...args);
    let result = [];
    while (result.length < size) {
      let data = (await this.reader.read()).value;
      result.push(...data);
    }
    return result;
  }

  async getVariable(variable) {
    return await this.command(cmds.GET_VARIABLE, variable.size, variable.id);
  }

  async setVariable(variable, value) {
    return await this.command(cmds.SET_VARIABLE, variable.size, variable.id, value);
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
};

let logoImageURL = function(header) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 8;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";

  const logo = unpack("HHHHHHHHHHHHHHHHHHHHHHHH", header.slice(0x104, 0x134));
  let tileIndex = 0;
  for (let tileRow = 0; tileRow < 2; ++tileRow) {
    for (let tileCol = 0; tileCol < 12; ++tileCol) {
      const tileData = logo[tileIndex];
      let bit = 0x8000;
      for (let row = 0; row < 4; ++row) {
        for (let col = 0; col < 4; ++col) {
          const x = tileCol * 4 + col;
          const y = tileRow * 4 + row;
          if (tileData & bit) {
            ctx.fillRect(x, y, 1, 1);
          }
          bit >>= 1;
        }
      }
      ++tileIndex;
    }
  }

  return canvas.toDataURL();
};

let handleClick = async function() {
  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort()];
  }

  let port = ports[0];
  await port.open({baudRate: 1000000});
  let client = new Client(port);
  console.log(await client.identify());

  try {
    await dmg.connect(client);

    let header = [];
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header.push(...await client.transfer(cmds.DMG_CART_READ, 64));
    header = new Uint8Array(header);
    console.log(hex(await window.crypto.subtle.digest("SHA-1", header.slice(0, 0x180))));

    const cart = dmg.detect(header);
    console.log(cart);
    document.getElementById("title").replaceChildren(cart.title);
    document.getElementById("code").replaceChildren(cart.mfrCode);
    document.getElementById("mapper").replaceChildren(cart.mapperName);
    document.getElementById("rom").replaceChildren(unitBytes(cart.romSize));
    document.getElementById("sav").replaceChildren(unitBytes(cart.savSize));

    const img = new Image();
    img.src = logoImageURL(header);
    document.getElementById("logo").replaceChildren(img);

  } finally {
    await client.command(cmds.CART_PWR_OFF);
  }
};

document.addEventListener("DOMContentLoaded", (e) => {
  document.getElementById("connect").addEventListener("click", (e) => {
    handleClick();
  });
});
