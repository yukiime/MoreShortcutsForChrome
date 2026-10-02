"""Package upgraded source and its standalone extension build, without local evidence."""
from pathlib import Path
import hashlib
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
subprocess.run(['node', str(root / 'scripts/build-experiment.mjs')], cwd=root, check=True)
excluded_parts = {'__pycache__', 'validation', '.git', 'node_modules'}
excluded_names = {'progress.md', '.DS_Store'}


def shareable(path):
    return (path.is_file() and not excluded_parts.intersection(path.relative_to(root).parts)
            and path.name not in excluded_names and path.suffix not in {'.log', '.pyc', '.zip'})


def archive(target, files, relative_root, prefix):
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for path in sorted(files):
            output.write(path, Path(prefix) / path.relative_to(relative_root))
    with zipfile.ZipFile(target) as output:
        assert output.testzip() is None
        assert not any('/validation/' in name or name.endswith('/progress.md') for name in output.namelist())
    print(f'{target.name}: {target.stat().st_size} bytes, {len(files)} files')
    print(f'SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')


files = [root / 'README.md', root / 'package.json', root / '.gitignore']
for folder in ['extension', 'tests', 'scripts', 'docs']:
    files.extend(path for path in (root / folder).rglob('*') if shareable(path))
archive(root / 'native-ntp-sidepanel-prototype.zip', files, root, 'native-ntp-sidepanel-prototype')
experiment = root / 'build/native-auto-open'
archive(root / 'native-ntp-sidepanel-experiment.zip', [p for p in experiment.rglob('*') if shareable(p)], experiment, 'native-ntp-sidepanel-experiment')
