"""Generate the FAQ structured data from the visible markup.

    python scripts/build_faq_schema.py

The FAQ questions and answers live in the page, where a reader and a crawler
can both see them. This script reads them from there and writes the
FAQPage JSON-LD, so the two can never drift apart - a mismatch between the
structured data and the page is the thing search engines penalise, and it is
the easiest mistake to make by hand.

It also removes any hand-written FAQPage node from the page's main
JSON-LD block, so there is exactly one source of truth.

Run it after changing any FAQ answer.
"""
import glob
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARK_START = '<!-- FAQ SCHEMA: START -->'
MARK_END = '<!-- FAQ SCHEMA: END -->'

# one FAQ item: the question button, then the answer paragraph
ITEM = re.compile(
    r'<div class="faq-item[^"]*">\s*'
    r'<h3 class="faq-q">\s*'
    r'<button class="faq-question" type="button">'
    r'(?P<q>.*?)'
    r'<i class="fa-solid fa-plus"[^>]*></i>'
    r'</button>\s*</h3>\s*'
    r'<div class="faq-answer"><div class="faq-answer-inner">'
    r'(?P<a>.*?)'
    r'</div></div>\s*'
    r'</div>',
    re.S)

TAG = re.compile(r'<[^>]+>')


def text_of(fragment):
    """The visible text of a fragment, with the entities decoded."""
    s = TAG.sub('', fragment)
    s = (s.replace('&nbsp;', ' ').replace('&ndash;', '-').replace('&mdash;', '-')
           .replace('&amp;', '&').replace('&quot;', '"')
           .replace('&#39;', "'").replace('&rsquo;', "'").replace('&lsquo;', "'")
           .replace('&hellip;', '...').replace('&mdash;', '-'))
    return ' '.join(s.split())


def main():
    total = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        src = io.open(path, encoding='utf-8').read()

        items = []
        for m in ITEM.finditer(src):
            q = text_of(m.group('q'))
            a = text_of(m.group('a'))
            if q and a:
                items.append({'q': q, 'a': a})

        # --- remove any hand-written FAQPage node from the main JSON-LD ---
        main_block = re.search(r'<script type="application/ld\+json">.*?</script>',
                               src, flags=re.S)
        if not main_block:
            raise SystemExit('no JSON-LD block found in ' + name)
        insert_at = main_block.end()

        def strip_faq(match):
            try:
                data = json.loads(match.group(1))
            except ValueError:
                return match.group(0)
            graph = data.get('@graph')
            if graph:
                data['@graph'] = [n for n in graph if n.get('@type') != 'FAQPage']
                if not data['@graph']:
                    return ''
            elif data.get('@type') == 'FAQPage':
                return ''
            return ('<script type="application/ld+json">'
                    + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                    + '</script>')

        src = re.sub(r'<script type="application/ld\+json">(.*?)</script>',
                     strip_faq, src, flags=re.S)

        # --- write the generated block ---
        if items:
            schema = {
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                'mainEntity': [
                    {
                        '@type': 'Question',
                        'name': it['q'],
                        'acceptedAnswer': {'@type': 'Answer', 'text': it['a']}
                    } for it in items
                ]
            }
            block = (MARK_START + '\n'
                     '<script type="application/ld+json">'
                     + json.dumps(schema, ensure_ascii=False, separators=(',', ':'))
                     + '</script>\n'
                     + MARK_END)
        else:
            block = MARK_START + '\n' + MARK_END

        if MARK_START in src:
            src = re.sub(re.escape(MARK_START) + r'.*?' + re.escape(MARK_END),
                         lambda _: block, src, flags=re.S)
        else:
            # put it where the main JSON-LD block was
            src = src[:insert_at] + '\n  ' + block + src[insert_at:]

        # tidy the blank lines the block may leave behind
        src = re.sub(r'\n[ \t]+\n', '\n\n', src)
        src = re.sub(r'\n{3,}', '\n\n', src)

        io.open(path, 'w', encoding='utf-8', newline='\n').write(src)
        total += len(items)
        print('  %-24s %d question(s)' % (name, len(items)))

    print('%d question(s) written to the structured data' % total)


if __name__ == '__main__':
    main()
