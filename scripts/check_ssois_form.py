import urllib.request
import re

url = "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ssois/"
with urllib.request.urlopen(url) as resp:
    html = resp.read().decode('utf-8')
    forms = re.findall(r'<form.*?</form>', html, re.DOTALL)
    print(f"Forms found: {len(forms)}")
    for f in forms:
        action = re.findall(r'action=[\"\'](.*?)[\"\']', f)
        inputs = re.findall(r'<input[^>]*name=[\"\'](.*?)[\"\']', f)
        print("  Form action:", action, "inputs:", inputs)
