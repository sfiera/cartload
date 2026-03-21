// Cartload is (c) 2026 by sfiera. Licensed under GPLv3.

import AgbCart from "./agb.js";
import Client from "./client.js";
import DmgCart from "./dmg.js";
import cmds from "./gbxcart/cmds.js";
import GameGearCart from "./gg.js";
import LynxCart from "./lynx.js";
import NeoGeoPocketCart from "./ngp.js";
import {downloadUrl, hex, makeElement, toDataUrl, unitBytes} from "./util.js";

const PLATFORMS = {
  dmg: DmgCart,
  agb: AgbCart,
  gg: GameGearCart,
  ngp: NeoGeoPocketCart,
  lynx: LynxCart,
};

const showInfo = (cart, dbEntry) => {
  const detected = document.getElementById("detected");
  const title = document.getElementById("title");
  const code = document.getElementById("code");
  const mapper = document.getElementById("mapper");
  const rom = document.getElementById("rom");
  const sav = document.getElementById("sav");
  const logo = document.getElementById("logo");

  if (cart) {
    detected.replaceChildren(dbEntry ? `${dbEntry.gn} ${dbEntry.ne}` : "(unknown)");
    title.replaceChildren(cart.title || "(none)");
    code.replaceChildren(cart.code || "(none)");
    mapper.replaceChildren(cart.mapperName);
    rom.replaceChildren(unitBytes(cart.romSize));
    sav.replaceChildren(unitBytes(cart.savSize));

    const img = new Image();
    img.src = cart.logoImageUrl();
    logo.replaceChildren(img);
  } else {
    detected.replaceChildren();
    title.replaceChildren();
    code.replaceChildren();
    mapper.replaceChildren();
    rom.replaceChildren();
    sav.replaceChildren();
    logo.replaceChildren();
  }
};

const showProgress = (curr, max) => {
  const progress = document.getElementById("progress");
  const pct = Math.floor(1000 * curr / max) / 10;
  progress.value = pct;
  progress.innerText = `${pct}%`;
};

const handleConnect = async platform => {
  const ctrl = new AbortController();
  const signal = ctrl.signal;

  let ports = await navigator.serial.getPorts();
  if (!ports.length) {
    ports = [await navigator.serial.requestPort({
      filters: [
        {usbVendorId: 0x1a86, usbProductId: 0x7523},
      ],
    })];
  }

  const client = await Client.open(ports[0]);
  await client.lock(0, async client => {
    console.log(await client.identify());
  });

  try {
    await run(client, platform, {signal});
  } catch (e) {
    showErr(e);
  } finally {
    ctrl.abort();
    await client.lock(0, async client => {
      await client.command(cmds.CART_PWR_OFF);
      await client.close();
    });
  };
};

const action = async (fn) => {
  const elements = [];
  [...document.getElementsByTagName("button")].forEach(e => {
    elements.push([e, !!e.disabled]);
    e.disabled = true;
  });
  try {
    return await fn();
  } finally {
    elements.forEach(([e, dis]) => e.disabled = dis);
  };
};

const run = async (client, platform, {signal}) => {
  let cart = null;
  try {
    await platform.connect(client);
    cart = await platform.detect(client);
  } finally {
    await client.lock(0, async client => {
      await client.command(cmds.CART_PWR_OFF);
    });
  }

  console.log(cart);
  if (!cart) {
    return;
  }

  const digest = hex(await cart.headerDigest());
  const db = await platform.db();
  const dbEntry = db[digest];
  const title = dbEntry ? `${dbEntry.gn} ${dbEntry.ne}` : (cart.title || cart.code || "game");
  console.log(title, digest, dbEntry);

  showInfo(cart, dbEntry);
  signal.addEventListener("abort", () => showInfo(null));

  const disconnect = document.getElementById("disconnect");
  const header = disconnect.parentElement;

  const backUpRom = makeElement("button", {
    children: [`Back up .${cart.extension}`],
    onclick: async () => {
      await action(async () => {
        const data = await cart.backUpRom(client, len => showProgress(len, cart.romSize));
        console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
        downloadUrl(`${title}.${cart.extension}`, await toDataUrl(data));
      });
    },
  });
  header.append(backUpRom);
  signal.addEventListener("abort", () => backUpRom.remove());

  if (cart.canBackUpSav) {
    const backUpSav = makeElement("button", {
      children: ["Back up .sav"],
      onclick: async () => {
        await action(async () => {
          const data = await cart.backUpSav(client, len => showProgress(len, cart.savSize));
          console.log(hex(await window.crypto.subtle.digest("SHA-1", data)));
          downloadUrl(`${title}.sav`, await toDataUrl(data));
        });
      },
    });
    header.append(" ", backUpSav);
    signal.addEventListener("abort", () => backUpSav.remove());
  }

  const {promise, resolve} = Promise.withResolvers();
  disconnect.disabled = false;
  disconnect.addEventListener("click", () => resolve(), {signal});
  signal.addEventListener("abort", () => disconnect.disabled = true);

  await promise;
};

const runModal = (children, buttons) => new Promise(resolve => {
  const dlog = makeElement("dialog", {children: children});

  const form = makeElement("form", {
    method: "dialog",
    children: buttons.map(b => makeElement("button", {innerText: b, value: b})),
  });
  form.firstChild.autofocus = true;
  dlog.appendChild(form);

  dlog.addEventListener("close", e => {
    document.body.removeChild(dlog);
    resolve(dlog.returnValue);
  });
  document.body.appendChild(dlog);
  dlog.showModal();
});

const [h3, p, ul, li, tt] = ["h3", "p", "ul", "li", "tt"].map(
    tag => ((...children) => makeElement(tag, {children: children})));

const showErr = e => {
  console.log(e);
  runModal([h3(e.name), p(e.message)], ["OK"]);
};

document.addEventListener("DOMContentLoaded", () => {
  const platform = document.getElementById("platform");
  const connect = document.getElementById("connect");

  if (!navigator.serial) {
    platform.disabled = true;
    runModal(
        [
          h3("Web Serial missing"),
          p("Cartload requires a ",
            makeElement("a", {
              href: "https://caniuse.com/web-serial",
              children: "Web Serial-compatible browser",
            }),
            ", such as the desktop versions of Chrome, Edge, or Opera."),
        ],
        ["OK"]);
    return;
  }

  platform.addEventListener("change", () => {
    connect.disabled = !platform.value;
  });

  connect.addEventListener("click", async () => {
    connect.disabled = true;
    platform.disabled = true;
    try {
      await handleConnect(PLATFORMS[platform.value]);
    } catch (e) {
      showErr(e);
    } finally {
      connect.disabled = false;
      platform.disabled = false;
    }
  });
});
