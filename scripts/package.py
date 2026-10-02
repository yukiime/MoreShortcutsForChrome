"""Create a portable ZIP with source, docs, tests and reproducible checks. No dependencies."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
target = root / 'native-ntp-sidepanel-prototype.zip'
folders = ['extension', 'tests', 'scripts', 'docs', 'validation']
files = [root / 'README.md', root / 'package.json']
for folder in folders:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, Path('native-ntp-sidepanel-prototype') / path.relative_to(root))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
print(f'{target.name}: {target.stat().st_size} bytes, {len(files)} files')
print(f'SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')
