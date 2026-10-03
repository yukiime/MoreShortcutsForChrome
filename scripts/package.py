"""Create public source and extension archives; exclude all local evidence."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / 'dist'
output.mkdir(exist_ok=True)
excluded_parts = {'.local', 'build', 'dist', '__pycache__', 'validation', '.git', 'node_modules', '.superpowers'}
excluded_names = {'progress.md', '.DS_Store', '.npmrc', 'Thumbs.db'}


def shareable(path):
    return (path.is_file() and not excluded_parts.intersection(path.relative_to(root).parts)
            and path.name not in excluded_names and not path.name.startswith('.env')
            and path.suffix not in {'.log', '.pyc', '.zip', '.pem', '.key'})


def archive(name, files, relative_root, prefix):
    target = output / name
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for path in sorted(files):
            package.write(path, Path(prefix) / path.relative_to(relative_root))
    with zipfile.ZipFile(target) as package:
        assert package.testzip() is None
        assert not any(excluded_parts.intersection(Path(name).parts) for name in package.namelist())
    print(f'{target.relative_to(root)}: {target.stat().st_size} bytes, {len(files)} files')
    print(f'SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')


files = [root / name for name in ['README.md', 'CONTRIBUTING.md', 'package.json', '.gitignore', '.gitattributes']]
if (root / 'LICENSE').is_file():
    files.append(root / 'LICENSE')
for folder in ['extension', 'tests', 'scripts', 'docs', 'archive']:
    files.extend(path for path in (root / folder).rglob('*') if shareable(path))
archive('MoreShortcutsForChrome-source.zip', files, root, 'MoreShortcutsForChrome')
extension = root / 'extension'
archive('MoreShortcutsForChrome-extension.zip', [p for p in extension.rglob('*') if shareable(p)], extension, 'extension')
