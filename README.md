# Cartload

[Cartload][app] is a [GPLv3][gpl] cartridge backup utility in the browser for multiple handheld systems. It can back up cartridges for:

* Nintendo [Game Boy][dmg]
* Nintendo [Game Boy Advance][gba]
* Sega [Game Gear][gg] ([adapter][a01] required)
* SNK [Neo Geo Pocket][ngp] ([adapter][a02] required)
* Atari [Lynx][lynx] ([adapter][a02] required)

[app]: https://cartload.org/
[gpl]: ./LICENSE
[dmg]: https://en.wikipedia.org/wiki/Game_Boy
[gba]: https://en.wikipedia.org/wiki/Game_Boy_Advance
[gg]: https://en.wikipedia.org/wiki/Game_Gear
[ngp]: https://en.wikipedia.org/wiki/Neo_Geo_Pocket
[lynx]: https://en.wikipedia.org/wiki/Atari_Lynx

## Requirements

Cartload uses the [Web Serial API][web-serial], which is available in Blink-based browsers such as the desktop versions of:

* Google [Chrome][chrome]
* Microsoft [Edge][edge]
* [Opera][opera]

[web-serial]: https://caniuse.com/web-serial
[chrome]: https://www.google.com/chrome/
[edge]: https://www.microsoft.com/edge/
[opera]: https://www.opera.com/

In addition, it uses the following hardware:

* InsideGadgets [GBxCart RW][gbxcart] (required, for all systems)
* Analogue [AP\_A01][a01] (optional, for Sega Game Gear)
* Analogue [AP\_A02][a02] (optional, for SNK Neo Geo Pocket)
* Analogue [AP\_A03][a02] (optional, for Atari Lynx)

[gbxcart]: https://www.gbxcart.com/
[a01]: https://store.analogue.co/products/game-gear-cartridge-adapter
[a02]: https://store.analogue.co/products/analogue-pocket-adapter-pack

## Q&A

* Q: What about PC-Engine/TurboGrafx-16 HuCards, with the AP\_A04?

  A: The AP\_A04 adapter is considerably more complicated than the other 3 adapters. It hasn’t been reverse-engineered far enough to build on top of it.

* Q: Why don’t my Neo Geo Pocket backups match public digests?

  A: NGP cartridges store game code and save data in a single flash chip, and backup utilities can’t distinguish one from the other. Unless the cartridge has never been used, any backup will likely contain save data that prevents it from matching.
