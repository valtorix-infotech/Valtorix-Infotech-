"""The share tags and the sitemap.

    python scripts/build_meta.py

Three things:

  1. `og:url` on every page, matching the page's canonical URL. Without
     it a share preview can be de-duplicated to the wrong address.
  2. `og:image:alt`, `og:image:width` and `og:image:height` next to the
     image, so a preview that shows the image knows what it is and how big
     it is.
  3. `<lastmod>` on every sitemap entry, taken from the last commit that
     touched the file. A sitemap without it gives a crawler no signal about
     how often to come back.
"""
import glob
import io
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = 'https://valtorixinfotech-1446.vercel.app'

OG_IMAGE = ORIGIN + '/images/brand/og-image.png'
OG_IMAGE_ALT = ('The VALTORIX INFOTECH mark: a geometric V built from two '
                'chevrons, beside the studio name.')


def slug_of(name):
    if name == 'index.html':
        return ORIGIN + '/'
    return ORIGIN + '/' + name[:-5]


def last_commit(file):
    try:
        out = subprocess.check_output(
            ['git', 'log', '-1', '--format=%cI', '--', file],
            cwd=ROOT, text=True).strip()
        return out.split('T')[0] if out else None
    except Exception:
        return None


def main():
    # ---------------------------------------------------------- the pages
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        s = io.open(path, encoding='utf-8').read()
        o = s

        url = slug_of(name)

        # og:url, right after og:type
        if 'property="og:url"' not in s:
            s = s.replace('<meta property="og:type"',
                          '<meta property="og:url" content="%s">\n  <meta property="og:type"' % url, 1)

        # the image dimensions and its alternative text
        if 'property="og:image:alt"' not in s:
            s = s.replace(
                '<meta property="og:image" content="%s">' % OG_IMAGE,
                '<meta property="og:image" content="%s">\n'
                '  <meta property="og:image:width" content="1200">\n'
                '  <meta property="og:image:height" content="630">\n'
                '  <meta property="og:image:alt" content="%s">' % (OG_IMAGE, OG_IMAGE_ALT), 1)

        # og:locale, on every page
        if 'property="og:locale"' not in s:
            s = s.replace('<meta property="og:site_name"',
                          '<meta property="og:locale" content="en_IN">\n'
                          '  <meta property="og:site_name"', 1)

        if s != o:
            io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
            print('  %-24s share tags' % name)

    # ---------------------------------------------------------- the sitemap
    entries = []
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        if name == '404.html':
            continue          # a not-found page is never in a sitemap
        entries.append((name, slug_of(name)))

    priority = {'index.html': '1.0', 'services.html': '0.9', 'start-a-project.html': '0.9',
                'solutions.html': '0.8', 'projects.html': '0.8', 'about-us.html': '0.7',
                'contact.html': '0.7', 'privacy-policy.html': '0.3', 'terms.html': '0.3'}
    freq = {'index.html': 'monthly', 'services.html': 'monthly', 'solutions.html': 'monthly',
            'projects.html': 'monthly', 'about-us.html': 'yearly', 'contact.html': 'yearly',
            'start-a-project.html': 'yearly', 'privacy-policy.html': 'yearly',
            'terms.html': 'yearly'}

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name, url in entries:
        mod = last_commit(name)
        out.append('  <url>')
        out.append('    <loc>%s</loc>' % url)
        if mod:
            out.append('    <lastmod>%s</lastmod>' % mod)
        out.append('    <changefreq>%s</changefreq>' % freq.get(name, 'monthly'))
        out.append('    <priority>%s</priority>' % priority.get(name, '0.5'))
        out.append('  </url>')
    out.append('</urlset>')

    io.open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') \
        .write('\n'.join(out) + '\n')
    print('  sitemap.xml               %d entries, with lastmod' % len(entries))


if __name__ == '__main__':
    main()
