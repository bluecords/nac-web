"""Rebuild material-symbols-outlined.subset.woff2 from icon-names.txt.

    pip install fonttools brotli
    python packages/client/src/icons/subset-icons.py [path/to/full/material-symbols-outlined.woff2]

The full font defaults to node_modules/material-symbols/material-symbols-outlined.woff2.
Names in icon-names.txt that the font does not have are reported and skipped.

Why not `pyftsubset --text`: every icon is a ligature of plain letters, so asking
for the letters keeps EVERY ligature whose letters are present, i.e. the whole
font. Each wanted ligature glyph is looked up and requested directly instead,
with layout closure off, so only those ligatures survive.
"""
import io
import os
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = os.path.dirname(os.path.abspath(__file__))
default_src = os.path.join(
    here, "..", "..", "..", "..", "node_modules", "material-symbols",
    "material-symbols-outlined.woff2",
)
src = sys.argv[1] if len(sys.argv) > 1 else default_src
names_file = os.path.join(here, "icon-names.txt")
out = os.path.join(here, "material-symbols-outlined.subset.woff2")

names = sorted({n.strip() for n in open(names_file).read().split() if n.strip()})

font = TTFont(src)
# Symbol.tsx pins wght 400 and leaves grade at 0, so those axes go; FILL (the
# active state) and opsz (automatic optical size) stay variable.
font = instancer.instantiateVariableFont(font, {"wght": 400, "GRAD": 0})
# Round-trip through bytes: after instancing, gvar has no entry for glyphs that
# no longer vary, and the subsetter then fails with a KeyError on them.
buf = io.BytesIO()
font.save(buf)
buf.seek(0)
font = TTFont(buf)

cmap = font.getBestCmap()
ligatures = {}
for lookup in font["GSUB"].table.LookupList.Lookup:
    for sub in lookup.SubTable:
        if hasattr(sub, "ExtSubTable"):
            sub = sub.ExtSubTable
        for first, group in getattr(sub, "ligatures", {}).items():
            for lig in group:
                ligatures[tuple([first] + list(lig.Component))] = lig.LigGlyph

glyphs, missing = set(), []
for name in names:
    parts = [cmap.get(ord(ch)) for ch in name]
    ligature = None if None in parts else ligatures.get(tuple(parts))
    if ligature is None:
        missing.append(name)
    else:
        glyphs.add(ligature)
        glyphs.update(parts)

print(f"{len(names) - len(missing)} of {len(names)} names found; missing: {missing}")

options = Options()
options.layout_closure = False
options.layout_features = ["liga", "rlig", "calt"]
options.notdef_outline = True
options.glyph_names = False
options.hinting = False
subsetter = Subsetter(options)
subsetter.populate(glyphs=sorted(glyphs))
subsetter.subset(font)
font.flavor = "woff2"
font.save(out)
print(f"wrote {out} ({os.path.getsize(out)} bytes)")
