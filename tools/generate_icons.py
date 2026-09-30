"""Generate Chrome-compatible PNG icons using only the Python standard library."""
from pathlib import Path
import struct
import zlib


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def color(x, y):
    # A white car on a blue rounded square, with a gold sell/check badge.
    if (x < 9 or x > 119) and (y < 9 or y > 119):
        return (0, 0, 0, 0)
    if (x - 98) ** 2 + (y - 98) ** 2 <= 21 ** 2:
        if (87 <= x <= 96 and abs(y - (x + 12)) < 3) or (94 <= x <= 111 and abs(y - (202 - x)) < 3):
            return (23, 43, 70, 255)
        return (255, 192, 67, 255)
    if ((x - 35) ** 2 + (y - 86) ** 2 < 10 ** 2) or ((x - 91) ** 2 + (y - 86) ** 2 < 10 ** 2):
        return (23, 43, 70, 255)
    if 21 <= x <= 106 and 62 <= y <= 82:
        if (27 <= x <= 40 or 88 <= x <= 101) and 66 <= y <= 73:
            return (255, 192, 67, 255)
        return (255, 255, 255, 255)
    if 42 <= y <= 62 and 34 - (y - 42) * .5 <= x <= 93 + (y - 42) * .5:
        if 46 <= y <= 59 and 40 <= x <= 87:
            return (23, 43, 70, 255)
        return (255, 255, 255, 255)
    return (23, 99, 223, 255)


folder = Path(__file__).resolve().parents[1] / 'icons'
folder.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    data = bytearray()
    for y in range(size):
        data.append(0)
        for x in range(size):
            samples = [color((x + dx / 4) * 128 / size, (y + dy / 4) * 128 / size) for dx in range(4) for dy in range(4)]
            data.extend(round(sum(pixel[i] for pixel in samples) / 16) for i in range(4))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(data)) + chunk(b'IEND', b'')
    (folder / f'car-{size}.png').write_bytes(png)
print('Generated icons: 16, 32, 48, 128 px')
