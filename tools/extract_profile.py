"""Extract reproducible profile data, without executing the saved page."""
from html.parser import HTMLParser
from pathlib import Path
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')


class Profile(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = []
        self.buttons = []
        self.capture = None
        self.description = []
        self.in_description = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id') == 'description':
            self.in_description = True
            return
        if self.in_description:
            self.description.append(self.get_starttag_text())
        if tag == 'input' and (a.get('id') or a.get('aria-labelledby')) and a.get('type') != 'hidden' and not a.get('id', '').startswith(('exb', 'image-')):
            selector = '#' + a['id'] if a.get('id') else '[aria-labelledby="' + a['aria-labelledby'] + '"]'
            if a.get('type') == 'radio' and 'checked' not in a:
                return
            value = 'checked' in a if a.get('type') in ('checkbox', 'radio') else a.get('value', '')
            if value != '':
                self.fields.append([selector, value, a.get('role') == 'combobox'])
        if tag == 'button' and a.get('role') == 'combobox':
            self.capture = [a['aria-labelledby'], '']

    def handle_data(self, text):
        if self.capture:
            self.capture[1] += text
        if self.in_description:
            from html import escape
            self.description.append(escape(text))

    def handle_endtag(self, tag):
        if tag == 'button' and self.capture:
            self.buttons.append(['[aria-labelledby="' + self.capture[0] + '"]', self.capture[1], True])
            self.capture = None
        if self.in_description:
            if tag == 'div':
                self.in_description = False
            else:
                self.description.append('</' + tag + '>')


p = Profile()
p.feed(Path('autoscout24-form-filled.html').read_text(encoding='utf-8'))
print(json.dumps({'fields': p.fields, 'combos': p.buttons, 'descriptionHtml': ''.join(p.description)}, ensure_ascii=False, indent=2))
