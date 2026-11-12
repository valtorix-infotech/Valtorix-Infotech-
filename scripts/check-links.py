import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []
used = set()

for f in glob.glob('*.html'):
    src = open(f, encoding='utf-8').read()
    for m in re.findall(r'(?:src|href)="([^"]+)"', src):
        if m.startswith(('http://', 'https://', 'mailto:', 'tel:', '#', 'data:')):
            continue
        path = m.split('#')[0].split('?')[0]
        if not path:
            continue
        if path.endswith('/'):
            continue
        used.add(path)
        if not os.path.exists(path):
            problems.append((f, m, 'MISSING'))
    # inline url() references
    for m in re.findall(r"url\(['\"]?([^'\")]+)", src):
        p = m.split('?')[0]
        if p and not p.startswith('data:') and not os.path.exists(p):
            problems.append((f, m, 'MISSING (css url)'))

print('--- referenced files that do not exist ---')
for f, m, why in problems:
    print('  %-22s %-50s %s' % (f, m, why))
if not problems:
    print('  none')

print('\n--- images present but not referenced by any page ---')
for p in sorted(glob.glob('images/**/*', recursive=True)):
    if os.path.isdir(p):
        continue
    rel = p.replace('\\', '/')
    if rel in used:
        continue
    print('  %-52s %6.0f KB' % (rel, os.path.getsize(p) / 1024))

print('\n--- internal links between pages ---')
for f in sorted(glob.glob('*.html')):
    src = open(f, encoding='utf-8').read()
    for m in sorted(set(re.findall(r'href="([^"#?]+\.html)(?:#[^"]*)?"', src))):
        if not os.path.exists(m):
            print('  %-22s -> %s  MISSING' % (f, m))
        elif m != f and m not in used:
            print('  %-22s -> %s' % (f, m))
