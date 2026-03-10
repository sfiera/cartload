import * as agb from "./agb.js";
import {Client} from "./client.js";
import * as dmg from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import * as gg from "./gg.js";
import {downloadUrl, hex, toDataUrl, unitBytes} from "./util.js";

const PLATFORMS = {
  dmg,
  agb,
  gg,
};

const handleConnect = async function(platform) {
  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort()];
  }

  const port = ports[0];
  await port.open({baudRate: 1000000});
  const client = new Client(port);
  console.log(await client.identify());
  platform = PLATFORMS[platform];

  const ui = {
    title: document.getElementById("title"),
    code: document.getElementById("code"),
    mapper: document.getElementById("mapper"),
    rom: document.getElementById("rom"),
    sav: document.getElementById("sav"),
    logo: document.getElementById("logo"),

    progress: document.getElementById("progress"),

    platform: document.getElementById("platform"),
    connect: document.getElementById("connect"),
    backUp: document.getElementById("back-up"),
    disconnect: document.getElementById("disconnect"),
  };

  let cart = null;
  try {
    await platform.connect(client);
    cart = await platform.detect(client);
  } finally {
    await client.command(cmds.CART_PWR_OFF);
  }

  console.log(cart);
  if (!cart) {
    await client.close();
    await port.close();
    ui.platform.disabled = false;
    ui.connect.disabled = false;
    return;
  }

  console.log(hex(await window.crypto.subtle.digest("SHA-1", cart.header)));
  ui.title.replaceChildren(cart.title || "(none)");
  ui.code.replaceChildren(cart.code || "(none)");
  ui.mapper.replaceChildren(cart.mapperName);
  ui.rom.replaceChildren(unitBytes(cart.romSize));
  ui.sav.replaceChildren(unitBytes(cart.savSize));

  const img = new Image();
  img.src = cart.logoImageUrl(cart.header);
  ui.logo.replaceChildren(img);

  const handleBackUp = async () => {
    ui.backUp.disabled = true;
    const data = await cart.backUpRom(client, progress => {
      const pct = Math.floor(1000 * progress / cart.romSize) / 10;
      ui.progress.value = pct;
      ui.progress.innerText = `${pct}%`;
    });
    console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
    downloadUrl(`${cart.title || cart.code || "ROM"}.${cart.extension}`, await toDataUrl(data));
    ui.backUp.disabled = false;
  };
  ui.backUp.disabled = false;
  ui.backUp.addEventListener("click", handleBackUp);

  let resolveDisconnect;
  const disconnected = new Promise(resolve => resolveDisconnect = resolve);
  const handleDisconnect = async () => { resolveDisconnect(); };
  ui.disconnect.disabled = false;
  ui.disconnect.addEventListener("click", handleDisconnect);

  await disconnected;

  await client.command(cmds.CART_PWR_OFF);
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

document.addEventListener("DOMContentLoaded", () => {
  const platform = document.getElementById("platform");
  const connect = document.getElementById("connect");

  platform.addEventListener("change", () => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", () => {
    connect.disabled = true;
    platform.disabled = true;
    handleConnect(platform.value);
  });
});
