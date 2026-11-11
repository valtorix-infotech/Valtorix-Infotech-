import io

# The 404 page keeps its static mark: it is a single centred message, not a
# chapter of the story, so the full stage would fight the layout.
p = '404.html'
s = io.open(p, encoding='utf-8').read()
s = s.replace('<canvas class="site-stage" data-stage aria-hidden="true"></canvas>\n', '', 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('404 page: static mark only')

# inner pages: the first content section also opens up to the world
import glob
for f in glob.glob('*.html'):
    if f in ('index.html', '404.html'):
        continue
    s = io.open(f, encoding='utf-8').read()
    o = s
    s = s.replace('<section class="section">\n    <div class="container split">',
                  '<section class="section stage-section">\n    <div class="container split">', 1)
    s = s.replace('<section class="section">\n    <div class="container">',
                  '<section class="section stage-section">\n    <div class="container">', 1)
    if s != o:
        io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
        print('opened first content section in', f)
