Cartload
========

.. contents::

Overview
--------

Cartload_ is a GPLv3_ cartridge backup utility in the browser for multiple handheld systems. It can back up cartridges for:

* Nintendo `Game Boy`_
* Nintendo `Game Boy Advance`_
* Sega `Game Gear`_ (AP_A01_ adapter required)
* SNK `Neo Geo Pocket`_ (AP_A02_ adapter required)
* Atari Lynx_ (AP_A03_ adapter required)

.. _cartload: https://cartload.org/
.. _gplv3: ./LICENSE
.. _game boy: https://en.wikipedia.org/wiki/Game_Boy
.. _game boy advance: https://en.wikipedia.org/wiki/Game_Boy_Advance
.. _game gear: https://en.wikipedia.org/wiki/Game_Gear
.. _neo geo pocket: https://en.wikipedia.org/wiki/Neo_Geo_Pocket
.. _lynx: https://en.wikipedia.org/wiki/Atari_Lynx

Requirements
------------

Software
````````

Cartload uses the `Web Serial API`_, which is available in Blink-based browsers such as the desktop versions of:

* Google Chrome_
* Microsoft Edge_
* Opera_

.. _web serial api: https://caniuse.com/web-serial
.. _chrome: https://www.google.com/chrome/
.. _edge: https://www.microsoft.com/edge/
.. _opera: https://www.opera.com/

Hardware
````````

Cartload uses the following hardware:

* InsideGadgets `GBxCart RW`_ (required, for all systems)
* Analogue AP_A01_ (optional, for Sega Game Gear)
* Analogue AP_A02_ (optional, for SNK Neo Geo Pocket)
* Analogue AP_A03_ (optional, for Atari Lynx)

.. _gbxcart rw: https://www.gbxcart.com/
.. _ap_a01: https://store.analogue.co/products/game-gear-cartridge-adapter
.. _ap_a02: https://store.analogue.co/products/analogue-pocket-adapter-pack
.. _ap_a03: https://store.analogue.co/products/analogue-pocket-adapter-pack

Q&A
---

Q: What about PC-Engine/TurboGrafx-16 HuCards, with the AP\_A04?
  A: The AP_A04 adapter is considerably more complicated than the other 3 adapters. It hasn’t been reverse-engineered far enough to build on top of it.

Q: Why don’t my Neo Geo Pocket backups match public digests?
  A: NGP cartridges store game code and save data in a single flash chip, but public digests are for the original, unused state of cartridges. Unless a cartridge has never been used, any backup will likely contain save data that prevents it from matching.

Q: How does Cartload compare to FlashGBX_?
  A: At present, FlashGBX:

  * has many more features for Game Boy and Game Boy Advance cartridges, such as write support
  * supports devices other than GBxCart RW, such as GBFlash and Joey Jr.
  * is a Python app, so users of Firefox or Safari can use it

  Cartload:

  * supports Game Gear, Lynx, and Neo Geo Pocket through adapters
  * is a web app, but requires the use of specific browsers

Q: Is there any further documentation of the Analogue Pocket adapters?
  A: Yes, see `sfiera/pocket-adapters`_.

.. _flashgbx: https://github.com/lesserkuma/FlashGBX
.. _sfiera/pocket-adapters: https://github.com/sfiera/pocket-adapters
