import hpgeom
import numpy as np
from typing import Dict, Any, List, Optional
from .units import mjy_sr_to_ujy, mjy_sr_to_mjy

# Prominent Infrared Spectral Emission/Absorption Features (in microns)
SPECTRAL_MARKERS = [
    {"name": "Pa-beta", "wavelength_um": 1.282, "label": "Pa-beta (1.282 micron)"},
    {"name": "H-bump", "wavelength_um": 1.600, "label": "1.6 micron bump (H-minus opacity minimum in cool stars)"},
    {"name": "Pa-alpha", "wavelength_um": 1.875, "label": "Pa-alpha (1.875 micron)"},
    {"name": "Br-gamma", "wavelength_um": 2.166, "label": "Br-gamma (2.166 micron)"},
    {"name": "Br-beta", "wavelength_um": 2.625, "label": "Br-beta (2.625 micron)"},
    {"name": "PAH-3.3", "wavelength_um": 3.300, "label": "PAH (3.3 micron)"},
    {"name": "Br-alpha", "wavelength_um": 4.052, "label": "Br-alpha (4.052 micron)"},
    {"name": "CO", "wavelength_um": 4.670, "label": "CO bandhead (4.67 micron)"},
]
