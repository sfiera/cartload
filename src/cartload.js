import {Client} from "./client.js";
import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import vars from "./gbxcart/vars.js";
import * as gg from "./gg.js";
import {unpack} from "./struct.js";
import {downloadUrl, hex, toDataUrl, unitBytes} from "./util.js";

const MAX_TRANSFER_SIZE = 64;
const PLATFORMS = {
  dmg,
  gg,
};

let handleConnect = async function(platform) {
  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort()];
  }

  let port = ports[0];
  await port.open({baudRate: 1000000});
  let client = new Client(port);
  console.log(await client.identify());
  platform = PLATFORMS[platform];

  const ui = {
    title: document.getElementById("title"),
    code: document.getElementById("code"),
    mapper: document.getElementById("mapper"),
    rom: document.getElementById("rom"),
    sav: document.getElementById("sav"),
    logo: document.getElementById("logo"),

    platform: document.getElementById("platform"),
    connect: document.getElementById("connect"),
    backUp: document.getElementById("back-up"),
    disconnect: document.getElementById("disconnect"),
  };

  try {
    await platform.connect(client);
    const cart = await platform.detect(client);

    console.log(cart);
    console.log(hex(await window.crypto.subtle.digest("SHA-1", cart.header)));
    ui.title.replaceChildren(cart.title || "(none)");
    ui.code.replaceChildren(cart.code || "(none)");
    ui.mapper.replaceChildren(cart.mapperName);
    ui.rom.replaceChildren(unitBytes(cart.romSize));
    ui.sav.replaceChildren(unitBytes(cart.savSize));

    const img = new Image();
    img.src = cart.logoImageUrl(cart.header);
    ui.logo.replaceChildren(img);

    let handleBackUp = async (e) => {
      ui.backUp.disabled = true;
      const data = await cart.backUpRom(client);
      console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
      downloadUrl(`${cart.title || cart.code || 'ROM'}.${cart.extension}`, await toDataUrl(data));
      ui.backUp.disabled = false;
    };
    ui.backUp.disabled = false;
    ui.backUp.addEventListener("click", handleBackUp);

    let handleDisconnect = async (e) => {
      await client.close();
      await port.close();

      ui.disconnect.disabled = true;
      ui.disconnect.removeEventListener("click", handleDisconnect);
      ui.backUp.disabled = true;
      ui.backUp.removeEventListener("click", handleBackUp);
      ui.platform.disabled = false;
      ui.connect.disabled = false;

      ui.title.replaceChildren();
      ui.code.replaceChildren();
      ui.mapper.replaceChildren();
      ui.rom.replaceChildren();
      ui.sav.replaceChildren();
      ui.logo.replaceChildren();
    };
    ui.disconnect.disabled = false;
    ui.disconnect.addEventListener("click", handleDisconnect);

  } finally {
    await client.command(cmds.CART_PWR_OFF);
  }
};

document.addEventListener("DOMContentLoaded", (e) => {
  const platform = document.getElementById("platform");
  const connect = document.getElementById("connect");

  platform.addEventListener("change", (e) => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", (e) => {
    connect.disabled = true;
    platform.disabled = true;
    handleConnect(platform.value);
  });
});
