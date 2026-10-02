"""Generate simple code-drawn toolbar PNGs with Python standard library. No build needed to load."""
from pathlib import Path
import struct
import zlib

destination = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
destination.mkdir(exist_ok=True)
def chunk(name, payload):
    return struct.pack('>I', len(payload)) + name + payload + struct.pack('>I', zlib.crc32(name + payload) & 0xffffffff)
for size in [16, 32, 48, 128]:
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            gx, gy = x / size, y / size
            inside = any(left <= gx < left + .23 and top <= gy < top + .23 for left in [.18, .59] for top in [.18, .59])
            rows.extend((66, 133, 244, 255) if inside else (0, 0, 0, 0))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')
    (destination / f'icon{size}.png').write_bytes(png)
