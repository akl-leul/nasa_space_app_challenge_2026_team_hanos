import urllib.request
import urllib.parse
import json

cadc_tap = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
query = urllib.parse.quote("SELECT TOP 10 column_name, table_name FROM tap_schema.columns WHERE table_name LIKE 'caom2%' AND (column_name LIKE '%collection%' OR column_name LIKE '%obs%')")
url = f"{cadc_tap}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY={query}"
try:
    with urllib.request.urlopen(url, timeout=15) as resp:
        print("CADC CAOM2 columns:", resp.read().decode('utf-8')[:500])
except Exception as e:
    print("CADC error:", e)

# Test query for NEOSSat on CADC
query2 = urllib.parse.quote("SELECT TOP 5 observationID, collection, target_name FROM caom2.Observation WHERE collection = 'NEOSSAT'")
# wait, earlier error was "validateColumnNonAlias: Column: [collection] does not exist." in caom2.Plane
# In caom2.Observation, is it obsCollection or collection?
query3 = urllib.parse.quote("SELECT TOP 5 column_name FROM tap_schema.columns WHERE table_name = 'caom2.Observation'")
url3 = f"{cadc_tap}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY={query3}"
try:
    with urllib.request.urlopen(url3, timeout=15) as resp:
        print("caom2.Observation columns:", resp.read().decode('utf-8')[:500])
except Exception as e:
    print("CADC error 3:", e)
