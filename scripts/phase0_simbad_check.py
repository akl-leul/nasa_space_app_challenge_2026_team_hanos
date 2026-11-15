import urllib.parse
import urllib.request
import json
import xml.etree.ElementTree as ET

print("=== Resolving targets via Sesame (CDS) with certifi / no-verify context ===")
import ssl
ctx = ssl._create_unverified_context()

targets = ["Barnard's star", "eps Ind B", "WISE J085510.83-071442.5", "RW Aur", "R Dra"]
for t in targets:
    url = f"https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?{urllib.parse.quote(t)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            xml_text = resp.read().decode('utf-8')
            root = ET.fromstring(xml_text)
            # Find resolver results
            res = root.find("Resolver")
            if res is not None:
                jpos = res.find("jpos")
                jradeg = res.find("jradeg")
                jdedeg = res.find("jdedeg")
                pm = res.find("pm")
                pmra = pm.find("pmra").text if pm is not None and pm.find("pmra") is not None else None
                pmde = pm.find("pmde").text if pm is not None and pm.find("pmde") is not None else None
                print(f"Target '{t}': RA={jradeg.text if jradeg is not None else None}, Dec={jdedeg.text if jdedeg is not None else None}, pmra={pmra}, pmdec={pmde}")
            else:
                print(f"Target '{t}': No resolver found in XML")
    except Exception as e:
        print(f"Target '{t}' Sesame error:", e)

print("\n=== Resolving targets via Harvard SIMBAD TAP ===")
for t in targets:
    clean_name = t.replace("'", "''")
    query = f"SELECT basic.main_id, basic.ra, basic.dec, basic.pmra, basic.pmdec, basic.plx_value FROM basic JOIN ident ON oidref = oid WHERE id = '{clean_name}'"
    url = "https://simbad.cfa.harvard.edu/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=" + urllib.parse.quote(query)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HANOS/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            print(f"Harvard TAP '{t}':", data.get("data"))
    except Exception as e:
        print(f"Harvard TAP '{t}' error:", e)
