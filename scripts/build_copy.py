"""The titles, descriptions and one editing error.

    python scripts/build_copy.py

Google truncates a title by pixel width (about 55-60 characters) and a meta
description at about 160 characters. Seven of the strings on this site were
longer than that, so they were guaranteed to be cut mid-word. And five of the
commercial pages spent their whole snippet describing the studio without
asking the reader to do anything.

This script also fixes a sentence in solutions.html that read the same twice
in a row - an editing error in a client-facing block.
"""
import glob
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TITLES = {
    'index.html': 'VALTORIX INFOTECH | Web, Software &amp; AI Studio in Hyderabad',
    'about-us.html': 'About VALTORIX INFOTECH | A software studio in Hyderabad',
    'services.html': 'Services | VALTORIX INFOTECH &mdash; Web, Software, AI &amp; Design',
    'solutions.html': 'Solutions | VALTORIX INFOTECH &mdash; Software by stage',
    'projects.html': 'Work | VALTORIX INFOTECH &mdash; Products and client builds',
    'contact.html': 'Contact | VALTORIX INFOTECH &mdash; Talk to a software engineer',
    'start-a-project.html': 'Start a Project | VALTORIX INFOTECH &mdash; Free scoping call',
    'privacy-policy.html': 'Privacy Policy | VALTORIX INFOTECH',
    'terms.html': 'Terms of Service | VALTORIX INFOTECH',
    '404.html': 'Page not found | VALTORIX INFOTECH',
}

DESCRIPTIONS = {
    'index.html': ('A Hyderabad software studio building business websites, web '
                   'applications, custom software and AI automation. See the work, '
                   'then send a scoped project request.'),
    'about-us.html': ('Founded in Hyderabad in 2022. We build websites, business '
                      'applications, custom software and AI automation &mdash; and hand '
                      'the code over. Meet the team.'),
    'services.html': ('Web development, business software, AI and workflow '
                      'automation, and UI/UX design &mdash; delivered in-house from '
                      'Hyderabad. See what each practice costs.'),
    'solutions.html': ('Software for startups, growing businesses and operations-heavy '
                       'teams &mdash; plus ready-made builds for retail, education, '
                       'healthcare and finance. Find your fit.'),
    'projects.html': ('HRMS Pro, FinTrack, EduLearn, HealthPlus, BrandCraft, ShopKart, '
                      'TravelGo and an AI assistant &mdash; plus the SiteTrack '
                      'construction case study. See the work.'),
    'contact.html': ('Tell us about your website, business software, AI or automation '
                     'project. Hyderabad studio, Mon&ndash;Sat 9AM&ndash;9PM. We reply '
                     'within 24 hours on business days.'),
    'start-a-project.html': ('Send a structured project request in four short steps: '
                             'scope, requirements, timeline and budget. We reply within '
                             '24 hours on business days.'),
    'privacy-policy.html': ('How VALTORIX INFOTECH collects, uses and protects your '
                            'information when you use our website and services. Read '
                            'the policy.'),
    'terms.html': ('The simple, transparent terms under which VALTORIX INFOTECH works '
                   'with its clients &mdash; services, quotes, payments, timelines, IP '
                   'and support. Read the terms.'),
    '404.html': ('That page does not exist. Head back to the VALTORIX INFOTECH '
                 'homepage, or browse our work and services.'),
}

# the editing error: the two halves of the sentence read the same
COPY_FIX = ('The site takes enquiries, the site is not connected. Someone retypes them '
            'into another tool, and the lead goes cold in the gap.',
            'The site takes enquiries, and the site is not connected to anything else. '
            'Someone retypes them into another tool, and the lead goes cold in the gap.')


def visible_len(s):
    """The length a reader (and a search engine) sees."""
    t = (s.replace('&amp;', '&').replace('&mdash;', '-').replace('&ndash;', '-')
          .replace('&nbsp;', ' ').replace('&rsquo;', "'").replace('&hellip;', '...'))
    return len(t)


def main():
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        s = io.open(path, encoding='utf-8').read()
        o = s

        if name in TITLES:
            import re
            s = re.sub(r'<title>.*?</title>', '<title>%s</title>' % TITLES[name],
                       s, count=1, flags=re.S)
        if name in DESCRIPTIONS:
            import re
            s = re.sub(r'<meta name="description" content="[^"]*">',
                       '<meta name="description" content="%s">' % DESCRIPTIONS[name],
                       s, count=1)

        if name == 'solutions.html':
            s = s.replace(COPY_FIX[0], COPY_FIX[1], 1)

        if s != o:
            io.open(path, 'w', encoding='utf-8', newline='\n').write(s)

        print('  %-24s title %2d   description %3d' % (
            name, visible_len(TITLES.get(name, '')), visible_len(DESCRIPTIONS.get(name, ''))))


if __name__ == '__main__':
    main()
