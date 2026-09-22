# Sources

`scripts/source.mjs` searches four public collections and keeps only files it can confirm are public domain or CC0. Each download is logged in `media/credits.json` with its title, creator, date, licence, the object's page and the query that found it.

| `--from` | Collection | Licence of what is kept | Notes |
|---|---|---|---|
| `met` | The Met Open Access | CC0 | Best for ceramics, textiles and lace. Always pass `--medium` (`Ceramics`, `Textiles`, `Glass`, `Metal`, `Minerals`); without it a query like "plate" returns furniture. Studio shots on grey gradient backdrops. |
| `aic` | Art Institute of Chicago | CC0 | Plates on dark gradient backdrops, lace, carpets, prints. Images come through IIIF at up to 1686px. The server answers 403 without the `AIC-User-Agent` header, which the script sends. |
| `nasa` | NASA Image and Video Library | Public domain (NASA media guidelines) | Earth limbs, sunrise from orbit, lunar and Martian horizons. Items credited to a non-NASA party are skipped. |
| `commons` | Wikimedia Commons | Public domain or CC0 (add `--allow-by` for CC BY and BY-SA, which then need the credit line) | Microscopy from the Berkshire Community College Bioscience Image Library (CC0), Haeckel's plates, scientific illustration. |

## Queries that have produced good domes

| Want | Query |
|---|---|
| Opening and closing limb | `--from nasa --q "earth limb"` (STS052-23-022, a sunrise limb with the Moon, is exceptional); `"sunrise earth limb"`; `"earth horizon orbit"` |
| Planet surface | `--from nasa --q "lunar horizon"`, `"Mars horizon"` |
| Plates with ornate rims | `--from aic --q "porcelain plate"`; `--from met --q "plate" --medium Ceramics` |
| Lace | `--from aic --q "lace"` (the Bonnet Veil is a semicircle: flip it); `--from met --q "lace" --medium Textiles` |
| Carpets and textiles | `--from aic --q "William Morris textile"`, `"carpet"` |
| Stem and root sections | `--from commons --q "Berkshire Community College Bioscience Image Library stem cross section"`; add `"root"`, `"leaf"`, `"Zea mays"` |
| Scientific illustration | `--from commons --q "Kunstformen der Natur Haeckel"` |
| Bowls and domes | `--from met --q "bowl" --medium Glass` or `Ceramics`, flipped |

Queries for macro textures of everyday materials (moss, agate, bread) mostly come back empty or CC BY. The drawn shots and the false-colour treatments fill that gap better than a weak photograph.

## Crop recipes

- **A plate on a studio backdrop:** `fit: "object"`, `shape: "ellipse"`, `width: 1.3` to `1.35`, any strong `sky`.
- **A semicircular object** (veil, collar, fan): `flip: "v"` so the round edge is on top, `width: 1.3`. For the reference's white-on-black lace, add `keepBackdrop: true` and `treat: { map: ["#0b0b0b", "#f3efe6"], invert: true, contrast: 1.6 }`, plus `wordLift: 20`.
- **A bowl:** `flip: "v"` gives a dome, but the foot ring becomes the top edge, which rarely reads well. Prefer plates.
- **A slide section cropped by the frame:** rotate it (`rotate: -90`) so its round side faces up, then `fit: "object"`.
- **A slide section with a natural arched top:** `fit: "object"` with no shape, `sky` in a paper tone.
- **A full-frame texture** (cells, a carpet, a Haeckel plate, the lunar surface): `fit: "cover"`, `zoom` 1.3 to 1.6, an `edge` that suits the material (`scallop` for cells and anemones, `ridge` for terrain, `rough` for textiles).
- **A photograph that is already a horizon** (an orbital limb): `fit: "cover"`, `dome: false`, `focus` so the limb sits between 0.5 and 0.75 of the height.

## Before posting

Open `reel.credits.md` and check that every line has a real object page. Museum objects are public domain, but a recognisable object (a famous plate, an artwork) can still invite questions. When in doubt, choose the less famous image.
