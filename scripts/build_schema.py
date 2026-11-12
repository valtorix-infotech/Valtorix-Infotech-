"""Generate the structured data for every page.

    python scripts/build_schema.py

One canonical description of the business, the same on every page, so that
the entity is unambiguous however a crawler arrives. Each page adds its own
node, and a breadcrumb trail where the page shows one.

The address is deliberately incomplete: a street address, a postal code and
coordinates are facts about a real place, and they are not in the repository.
Add them here once they are known - `postalCode`, `streetAddress` and `geo`
are the three fields a local search engine weighs most.

Run it after changing a page name, a description or a URL.
"""
import glob
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = 'https://valtorixinfotech-1446.vercel.app'
FAQ_START = '<!-- FAQ SCHEMA: START -->'
FAQ_END = '<!-- FAQ SCHEMA: END -->'

BUSINESS = {
    "@type": "ProfessionalService",
    "@id": ORIGIN + "/#business",
    "name": "VALTORIX INFOTECH",
    "url": ORIGIN + "/",
    "logo": ORIGIN + "/images/brand/valtorix-logo.svg",
    "image": ORIGIN + "/images/brand/og-image.png",
    "description": ("A software studio in Hyderabad building business websites, web "
                    "applications, custom business software and AI automation."),
    "email": "valtorix.infotech@gmail.com",
    "telephone": "+91-7989369571",
    "priceRange": "₹₹",
    "foundingDate": "2022",
    "address": {
        "@type": "PostalAddress",
        "addressLocality": "Hyderabad",
        "addressRegion": "Telangana",
        "addressCountry": "IN",
        # streetAddress, postalCode and geo belong here once they are known
    },
    "openingHoursSpecification": [{
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "opens": "09:00",
        "closes": "21:00",
    }],
    "areaServed": {"@type": "Country", "name": "India"},
    "knowsAbout": [
        "Web Development", "Web Applications", "Custom Business Software",
        "HRMS", "AI Automation", "UI/UX Design",
    ],
    "sameAs": [
        "https://www.instagram.com/valtorix.infotech",
        "https://wa.me/917989369571",
    ],
}

WEBSITE = {
    "@type": "WebSite",
    "@id": ORIGIN + "/#website",
    "url": ORIGIN + "/",
    "name": "VALTORIX INFOTECH",
    "inLanguage": "en-IN",
    "publisher": {"@id": ORIGIN + "/#business"},
}

BLOCK = re.compile(r'[ \t]*<script type="application/ld\+json">(.*?)</script>[ \t]*\n', re.S)
BREADCRUMB = re.compile(r'<nav class="breadcrumb"[^>]*>(.*?)</nav>', re.S)


def slug_of(page):
    """The clean URL of a page, the way Vercel serves it."""
    name = os.path.basename(page)
    if name == 'index.html':
        return ORIGIN + '/'
    return ORIGIN + '/' + name[:-5]


def breadcrumb_items(src):
    """The trail the page shows, read from the visible breadcrumb."""
    m = BREADCRUMB.search(src)
    if not m:
        return None
    items = []
    for href, text in re.findall(r'<a href="([^"]+)">([^<]*)</a>', m.group(1)):
        target = ORIGIN + '/' if href == 'index.html' else ORIGIN + '/' + href[:-5]
        items.append({"@type": "ListItem", "position": len(items) + 1,
                      "name": text.strip(), "item": target})
    # the current page is the last crumb and is not a link
    tail = re.findall(r'<span>([^<]*)</span>', m.group(1))
    if tail and tail[-1].strip():
        items.append({"@type": "ListItem", "position": len(items) + 1,
                      "name": tail[-1].strip()})
    return items or None


def main():
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        src = io.open(path, encoding='utf-8').read()

        # the page's own node: the first JSON-LD block that is not the FAQ one
        blocks = list(BLOCK.finditer(src))
        page_node = None
        first_block = None
        for b in blocks:
            if FAQ_START in src[max(0, b.start() - 60):b.start()]:
                continue
            if first_block is None:
                first_block = b
            try:
                data = json.loads(b.group(1))
            except ValueError:
                continue
            if page_node is None:
                page_node = data

        graph = [dict(BUSINESS)]
        if name == 'index.html':
            graph.append(dict(WEBSITE))
        if page_node is None:
            # a page with no node of its own still describes itself
            page_node = {
                "@type": "WebPage",
                "name": "VALTORIX INFOTECH",
                "url": slug_of(name),
                "isPartOf": {"@id": ORIGIN + "/#website"},
                "publisher": {"@id": ORIGIN + "/#business"},
            }
        node = page_node
        node.pop('@context', None)
        # the page points at the business rather than repeating it
        if node.get('@type') in ('AboutPage', 'ContactPage', 'CollectionPage', 'WebPage'):
            node['mainEntity'] = {"@id": ORIGIN + "/#business"}
            node['isPartOf'] = {"@id": ORIGIN + "/#website"}
            node['publisher'] = {"@id": ORIGIN + "/#business"}
        elif node.get('@type') == 'ItemList':
            node['publisher'] = {"@id": ORIGIN + "/#business"}
        graph.append(node)

        crumbs = breadcrumb_items(src)
        if crumbs:
            graph.append({
                "@type": "BreadcrumbList",
                "@id": slug_of(name) + "#breadcrumb",
                "itemListElement": crumbs,
            })

        out = {'@context': 'https://schema.org', '@graph': graph}
        block = ('  <script type="application/ld+json">'
                 + json.dumps(out, ensure_ascii=False, separators=(',', ':'))
                 + '</script>\n')

        if first_block is not None:
            src = src[:first_block.start()] + block + src[first_block.end():]
        else:
            # no block yet: put it at the end of <head>
            src = src.replace('</head>', block + '</head>', 1)

        io.open(path, 'w', encoding='utf-8', newline='\n').write(src)
        print('  %-24s %d node(s)%s' % (
            name, len(graph),
            ', breadcrumb' if crumbs else ''))

    print('the structured data is written')


if __name__ == '__main__':
    main()
