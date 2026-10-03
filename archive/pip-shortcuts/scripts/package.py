from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'native-ntp-pip-shortcuts.zip'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and path != output and not any(part in {'node_modules', '.DS_Store', '__pycache__'} for part in path.relative_to(root).parts):
            archive.write(path, Path(root.name) / path.relative_to(root))
print(output)
