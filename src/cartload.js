import * as dmg from "./dmg.js";
import {pack, unpack} from "./struct.js";
import {latin1} from "./util.js";

const CMD = {
  OFW_FW_VER : {id : 0x56, reqFormat : "B", respFormat : "B"},
  OFW_PCB_VER : {id : 0x68, reqFormat : "B", respFormat : "B"},
  QUERY_FW_INFO : {id : 0xA1, reqFormat : "B", respFormat : "pp??"},
  SET_MODE_AGB : {id : 0xA2, reqFormat : "B", respFormat : "B"},
  SET_MODE_DMG : {id : 0xA3, reqFormat : "B", respFormat : "B"},
  SET_VOLTAGE_3_3V : {id : 0xA4, reqFormat : "B", respFormat : "B"},
  SET_VOLTAGE_5V : {id : 0xA5, reqFormat : "B", respFormat : "B"},
  SET_VARIABLE : {id : 0xA6, reqFormat : "BBII", respFormat : "B"},
  ENABLE_PULLUPS : {id : 0xAB, reqFormat : "B", respFormat : "B"},
  DISABLE_PULLUPS : {id : 0xAC, reqFormat : "B", respFormat : "B"},
  GET_VARIABLE : {id : 0xAD, reqFormat : "BBI", respFormat : "I"},
  DMG_CART_READ : {id : 0xB1, reqFormat : "B", respFormat : ""},
  DMG_MBC_RESET : {id : 0xB4, reqFormat : "B", respFormat : "B"},
  CART_PWR_ON : {id : 0xF2, reqFormat : "B", respFormat : "B"},
  CART_PWR_OFF : {id : 0xF3, reqFormat : "B", respFormat : "B"},
  CART_QUERY_PWR : {id : 0xF4, reqFormat : "B", respFormat : "B"},
};

const VAR = {
  ADDRESS : {size : 4, id : 0x00},
  AUTO_POWEROFF_TIME : {size : 4, id : 0x01},
  TRANSFER_SIZE : {size : 2, id : 0x00},
  BUFFER_SIZE : {size : 2, id : 0x01},
  DMG_ROM_BANK : {size : 2, id : 0x02},
  STATUS_REGISTER : {size : 2, id : 0x03},
  LAST_BANK_ACCESSED : {size : 2, id : 0x04},
  STATUS_REGISTER_MASK : {size : 2, id : 0x05},
  STATUS_REGISTER_VALUE : {size : 2, id : 0x06},
  CART_MODE : {size : 1, id : 0x00},
  DMG_ACCESS_MODE : {size : 1, id : 0x01},
  FLASH_COMMAND_SET : {size : 1, id : 0x02},
  FLASH_METHOD : {size : 1, id : 0x03},
  FLASH_WE_PIN : {size : 1, id : 0x04},
  FLASH_PULSE_RESET : {size : 1, id : 0x05},
  FLASH_COMMANDS_BANK_1 : {size : 1, id : 0x06},
  FLASH_SHARP_VERIFY_SR : {size : 1, id : 0x07},
  DMG_READ_CS_PULSE : {size : 1, id : 0x08},
  DMG_WRITE_CS_PULSE : {size : 1, id : 0x09},
  FLASH_DOUBLE_DIE : {size : 1, id : 0x0A},
  DMG_READ_METHOD : {size : 1, id : 0x0B},
  AGB_READ_METHOD : {size : 1, id : 0x0C},
  CART_POWERED : {size : 1, id : 0x0D},
  PULLUPS_ENABLED : {size : 1, id : 0x0E},
  AUTO_POWEROFF_ENABLED : {size : 1, id : 0x0F},
  AGB_IRQ_ENABLED : {size : 1, id : 0x10},
};

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
    await this.setVariable(VAR.TRANSFER_SIZE, size);
    await this.command(cmd, ...args);
    let result = [];
    while (result.length < size) {
      let data = (await this.reader.read()).value;
      result.push(...data);
    }
    return result;
  }

  async getVariable(variable) {
    return await this.command(CMD.GET_VARIABLE, variable.size, variable.id);
  }

  async setVariable(variable, value) {
    return await this.command(CMD.SET_VARIABLE, variable.size, variable.id,
                              value);
  }

  async identify() {
    const [ofwPcbVer] = await this.command(CMD.OFW_PCB_VER);
    const [ofwFwVer] = await this.command(CMD.OFW_FW_VER);

    if ((ofwPcbVer < 5) || (ofwFwVer == 0)) {
      throw new Error("unsupported ofw version", ofwPcbVer, ofwFwVer);
    }

    const [info, nameEnc, cartPowerCtrl, bootloaderReset] =
        await this.command(CMD.QUERY_FW_INFO);
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
    ports = [ await navigator.serial.requestPort() ];
  }

  let port = ports[0];
  await port.open({baudRate : 1000000});
  let client = new Client(port);
  console.log(await client.identify());

  try {
    await client.setVariable(VAR.DMG_READ_METHOD, 1);
    await client.getVariable(VAR.CART_MODE);
    await client.command(CMD.SET_MODE_DMG);
    await client.command(CMD.SET_VOLTAGE_5V);
    await client.command(CMD.CART_PWR_ON);
    await client.command(CMD.DISABLE_PULLUPS);
    await client.setVariable(VAR.DMG_READ_METHOD, 1);
    await client.setVariable(VAR.CART_MODE, 1);
    await client.setVariable(VAR.DMG_READ_CS_PULSE, 0);
    await client.setVariable(VAR.DMG_WRITE_CS_PULSE, 0);
    await client.setVariable(VAR.DMG_ACCESS_MODE, 1);
    await client.setVariable(VAR.ADDRESS, 0x0000);
    await client.command(CMD.DMG_MBC_RESET);

    let header = [];
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header.push(...await client.transfer(CMD.DMG_CART_READ, 64));
    header = new Uint8Array(header);
    console.log(
        await window.crypto.subtle.digest("SHA-1", header.slice(0, 0x150)));

    const cart = dmg.detect(header);
    console.log(cart);
    document.getElementById("title").replaceChildren(cart.title);
    document.getElementById("code").replaceChildren(cart.mfrCode);
    document.getElementById("rom").replaceChildren(cart.romSize);
    document.getElementById("ram").replaceChildren(cart.ramSize);

    const img = new Image();
    img.src = logoImageURL(header);
    document.getElementById("logo").replaceChildren(img);

  } finally {
    await client.command(CMD.CART_PWR_OFF);
  }
};

document.addEventListener("DOMContentLoaded", (e) => {
  document.getElementById("connect").addEventListener(
      "click", (e) => { handleClick(); });
});
