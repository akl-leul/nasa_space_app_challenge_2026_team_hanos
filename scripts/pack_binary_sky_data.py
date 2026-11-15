import json
import struct
import os

os.makedirs("public/data", exist_ok=True)

# 1. Convert boundaries.json to boundaries.bin (Float32Array)
with open("public/data/boundaries.json", "r", encoding="utf-8") as f:
    boundaries = json.load(f)

# boundaries is a flat list: [ra1, dec1, ra2, dec2, ...]
# Pack as 32-bit floats
bin_boundaries = struct.pack(f"{len(boundaries)}f", *boundaries)
with open("public/data/boundaries.bin", "wb") as f:
    f.write(bin_boundaries)

print(f"boundaries.json: {os.path.getsize('public/data/boundaries.json')} bytes")
print(f"boundaries.bin:  {os.path.getsize('public/data/boundaries.bin')} bytes")

# 2. Convert stars.json to stars.bin (structured binary array)
with open("public/data/stars.json", "r", encoding="utf-8") as f:
    stars = json.load(f)

# Each star: ra (float32), dec (float32), mag (float32), bv (float32), hip (uint32) = 20 bytes
star_bytes = bytearray()
named_stars = []

for idx, s in enumerate(stars):
    ra = float(s["ra"])
    dec = float(s["dec"])
    mag = float(s["mag"])
    bv = float(s.get("bv", 0.0) or 0.0)
    hip = int(s.get("hip", 0) or 0)
    
    star_bytes.extend(struct.pack("ffffI", ra, dec, mag, bv, hip))
    
    if s.get("label") and mag <= 3.5:
        named_stars.append({
            "idx": idx,
            "name": s["label"],
            "mag": mag,
            "ra": ra,
            "dec": dec
        })

with open("public/data/stars.bin", "wb") as f:
    f.write(star_bytes)

with open("public/data/named_stars.json", "w", encoding="utf-8") as f:
    json.dump(named_stars, f)

print(f"stars.json:      {os.path.getsize('public/data/stars.json')} bytes")
print(f"stars.bin:       {os.path.getsize('public/data/stars.bin')} bytes")
print(f"named_stars.json:{os.path.getsize('public/data/named_stars.json')} bytes ({len(named_stars)} named stars)")
