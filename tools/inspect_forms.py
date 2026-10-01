"""Print relevant form controls from the supplied offline DOM snapshots."""
from html.parser import HTMLParser
from pathlib import Path
import json
import sys
import builtins

sys.stdout.reconfigure(encoding='utf-8')
def print(*args):
    text = ' '.join(str(arg) for arg in args)
    if '--summary' not in sys.argv or any(word in text for word in ('SPECIAL', 'contenteditable', 'checked', 'FILE:')):
        builtins.print(text)


class Inspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'contenteditable' in attrs or 'DatePicker' in attrs.get('class', '') or ('label' in attrs.get('id', '').lower() and tag not in ('label', 'input', 'button')):
            print('SPECIAL', tag, json.dumps(attrs, ensure_ascii=False))
        if 'contenteditable' in attrs:
            self.capture = [tag, attrs, '']
        if tag in ('input', 'select', 'textarea', 'button', 'label', 'option', 'h1', 'h2', 'a'):
            if tag == 'input':
                print(tag, json.dumps(attrs, ensure_ascii=False))
            else:
                self.capture = [tag, attrs, '']
        if tag == 'a' and '/manual-listing' in attrs.get('href', ''):
            print(tag, json.dumps(attrs, ensure_ascii=False))

    def handle_data(self, data):
        if self.capture:
            self.capture[2] += data

    def handle_endtag(self, tag):
        if self.capture and self.capture[0] == tag:
            print(*[json.dumps(x, ensure_ascii=False) for x in self.capture])
            self.capture = None


files = [Path(arg.split('=', 1)[1]) for arg in sys.argv if arg.startswith('--file=')]
for path in files or sorted(Path('.').glob('*.html')):
    print('\nFILE:', path.name)
    Inspector().feed(path.read_text(encoding='utf-8'))
