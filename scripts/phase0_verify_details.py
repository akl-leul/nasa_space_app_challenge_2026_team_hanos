import certifi
import ssl
import urllib.parse
import urllib.request
import json

ssl_context = ssl.create_default_context(cafile=certifi.where())

print("=== 1. Checking unistra with certifi ===")
try:
    url = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote("SELECT TOP 1 main_id, ra, dec, pmra, pmdec, plx_value FROM basic WHERE main_id = 'NAME Barnard''s star'")
    req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
    with urllib.request.urlopen(req, context=ssl_context, timeout=15) as resp:
        print("Unistra with certifi: 200 OK! bytes:", len(resp.read()))
except Exception as e:
    print("Unistra error with certifi:", e)

print("\n=== 2. Resolving all 5 targets via Harvard SIMBAD TAP ===")
targets = ["NAME Barnard's star", "NAME eps Ind B", "WISE J085510.83-071442.5", "NAME RW Aur", "NAME R Dra"]
for t in targets:
    url = "https://simbad.cfa.harvard.edu/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote(f"SELECT main_id, ra, dec, pmra, pmdec, plx_value FROM basic JOIN ident ON oidref = oid WHERE id = '{t}'")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            print(f"Target '{t}':", data.get("data"))
    except Exception as e:
        print(f"Target '{t}' error:", e)

print("\n=== 3. MOST formats with Pallas ===")
for mode in ["outfmt=0", "outfmt=1", "outfmt=2", "output_mode=Brief", "output_mode=ASCII", "output_mode=VOTable"]:
    url = f"https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most?catalog=spherex&input_type=name_input&obj_name=Pallas&obs_begin=2025+01+01&obs_end=2026+12+31&{mode}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            first_line = body[:150].decode('utf-8', errors='replace').replace('\n', ' ')
            print(f"MOST {mode}: status=200, {len(body)} bytes, starts with: {first_line[:80]}")
    except Exception as e:
        print(f"MOST {mode} error:", e)

print("\n=== 4. Checking IRSA Cutouts docs ===")
try:
    with urllib.request.urlopen("https://irsa.ipac.caltech.edu/ibe/cutouts.html", timeout=15) as resp:
        text = resp.read().decode('utf-8', errors='replace')
        print(f"Cutout docs 200 OK. Length: {len(text)}. Snippet:")
        for line in text.splitlines():
            if "center" in line or "size" in line or "cutout" in line.lower():
                print("  ", line.strip()[:100])
except Exception as e:
    print("Cutout docs error:", e)
