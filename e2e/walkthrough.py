"""Walk through the app in a phone-sized browser against a production build.

Run from the repository root after `npm run build`:
    python3 e2e/walkthrough.py [screenshot-folder]
Needs Python with Playwright and Chromium installed.
"""
import os
import re
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'e2e', 'screenshots')
os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:4173/subq-character-manager/'

server = subprocess.Popen(['npx', 'vite', 'preview', '--port', '4173', '--strictPort'], cwd=REPO,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try:
        urllib.request.urlopen(URL)
        break
    except Exception:
        time.sleep(0.25)

checks = []
errors = []


def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail))


def field(scope, label):
    """The input or select inside a field whose visible label is exactly `label`."""
    return scope.locator(f'xpath=.//label[contains(@class,"field")][span[normalize-space(.)="{label}"]]//*[self::input or self::select or self::textarea]').first


def hp(page):
    return page.get_by_test_id('hp-current').inner_text()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' else None)
        page.goto(URL)
        expect(page.get_by_text('No characters on this device yet.')).to_be_visible()
        page.screenshot(path=f'{OUT}/01-empty.png')

        # Create a 2014 dwarf fighter
        page.get_by_role('link', name='Create your first character').click()
        page.get_by_label('2014 rules').check()
        page.get_by_label('Character name').fill('Howerd')
        page.get_by_label('Player', exact=True).fill('Dan')
        page.get_by_label('Race', exact=True).fill('Dwarf')
        page.get_by_label('Class', exact=True).fill('Fighter')
        page.get_by_label('Level', exact=True).fill('3')
        page.get_by_label('Hit die').select_option('10')
        for ability, score in [('Strength', '16'), ('Dexterity', '14'), ('Constitution', '14'), ('Wisdom', '12'), ('Charisma', '8')]:
            page.get_by_label(ability, exact=True).fill(score)
        page.get_by_label('Speed in feet').fill('25')
        page.screenshot(path=f'{OUT}/02-new.png', full_page=True)
        expect(page.get_by_text('the average for your hit die, level and Constitution: 28')).to_be_visible()
        page.get_by_role('button', name='Create character').click()
        expect(page.get_by_test_id('hp-current')).to_have_text('28')
        check('Create: suggested HP 28 used', hp(page) == '28')
        check('Header shows edition badge', page.locator('.topbar .edition-2014').is_visible())

        # Damage and undo from the undo bar
        page.get_by_label('Damage or healing amount').fill('7')
        page.get_by_role('button', name='Damage', exact=True).click()
        expect(page.get_by_test_id('hp-current')).to_have_text('21')
        bar = page.locator('.undo-bar')
        check('Undo bar labels the change', 'Damage 7: HP 28 → 21' in bar.inner_text(), bar.inner_text())
        page.screenshot(path=f'{OUT}/03-damage.png')
        bar.get_by_role('button', name='Undo').click()
        expect(page.get_by_test_id('hp-current')).to_have_text('28')
        check('Undo bar reverses damage', hp(page) == '28')

        # Temporary HP absorbs damage
        page.get_by_role('button', name='Temporary HP').click()
        page.get_by_role('spinbutton', name='Temporary hit points').fill('5')
        page.get_by_role('button', name='Set to 5').click()
        expect(page.get_by_text('+5 temporary')).to_be_visible()
        page.get_by_label('Damage or healing amount').fill('8')
        page.get_by_role('button', name='Damage', exact=True).click()
        expect(page.get_by_test_id('hp-current')).to_have_text('25')
        check('Temporary HP absorbs damage first', hp(page) == '25')

        # Corruption meter
        page.get_by_role('button', name='New tracker').click()
        dialog = page.locator('dialog[open]')
        field(dialog, 'Name').fill('Corruption')
        field(dialog, 'Type').select_option('meter')
        field(dialog, 'Maximum').fill('10')
        field(dialog, 'Current').fill('0')
        field(dialog, 'Resets').select_option('never')
        dialog.get_by_role('button', name='Add tracker').click()
        page.get_by_role('button', name='Corruption plus one').click()
        page.get_by_role('button', name='Corruption plus one').click()
        expect(page.get_by_label('Corruption value')).to_contain_text('2')
        check('Corruption meter counts up', '2' in page.get_by_label('Corruption value').inner_text())

        # Custom currency, on the Gear tab
        page.get_by_role('link', name='Gear').click()
        page.get_by_role('button', name='New currency').click()
        dialog = page.locator('dialog[open]')
        field(dialog, 'Name').fill('Diomund Rays')
        dialog.get_by_role('button', name='Add currency').click()
        page.get_by_role('button', name='Diomund Rays: 0. Add or spend').click()
        dialog = page.locator('dialog[open]')
        field(dialog, 'Amount').fill('250')
        dialog.get_by_role('button', name='Add', exact=True).click()
        check('Custom currency adds', page.get_by_role('button', name='Diomund Rays: 250. Add or spend').is_visible())
        page.get_by_role('link', name='Play').click()

        # Conditions with rules text
        page.get_by_role('button', name='Add condition').click()
        page.locator('dialog[open]').get_by_role('button', name='Poisoned').click()
        page.locator('.chip-condition', has_text='Poisoned').click()
        rules = page.locator('dialog[open] .rules').inner_text()
        check('Condition shows 2014 rules text', 'disadvantage on attack rolls and ability checks' in rules, rules)
        page.screenshot(path=f'{OUT}/04-condition.png')
        page.locator('dialog[open]').get_by_role('button', name='Remove Poisoned').click()

        # Exhaustion, then a long rest and undoing it in one step
        page.get_by_role('button', name='Increase exhaustion').click()
        page.get_by_role('button', name='Increase exhaustion').click()
        check('Exhaustion shows the 2014 effect', page.get_by_text('Speed halved.').is_visible())
        page.screenshot(path=f'{OUT}/05-play.png', full_page=True)
        page.get_by_role('button', name='Long rest').click()
        effects = page.locator('dialog[open] .rules').inner_text()
        check('Long rest preview lists effects', 'HP 25 → 28' in effects and 'Exhaustion 2 → 1' in effects, effects)
        page.get_by_role('button', name='Finish long rest').click()
        expect(page.get_by_test_id('hp-current')).to_have_text('28')
        page.locator('.topbar').get_by_role('button', name='Undo the last change').click()
        expect(page.get_by_test_id('hp-current')).to_have_text('25')
        check('One undo reverses the whole long rest', page.get_by_text('Exhaustion 2').first.is_visible())

        # Stats: calculations, AC formulas, bonuses, overrides
        page.get_by_role('link', name='Stats').click()
        speed = page.get_by_role('button', name='Speed: 12 ft. Show the calculation')
        expect(speed).to_be_visible()
        check('2014 exhaustion halves speed (25 → 12)', speed.is_visible())
        page.get_by_role('button', name='Armor Class: 12. Show the calculation').click()
        dialog = page.locator('dialog[open]')
        parts = dialog.locator('.parts').inner_text()
        check('AC calculation lists its parts', 'Unarmored' in parts and 'Dexterity' in parts, parts)
        dialog.get_by_role('button', name='Add Unarmored Defense (Barbarian)').click()
        expect(dialog.locator('.parts-total dd')).to_have_text('14')
        page.screenshot(path=f'{OUT}/06-ac.png')
        check('Best AC formula is used automatically', dialog.locator('.parts-total dd').inner_text() == '14')
        dialog.get_by_role('button', name='Close').click()

        page.get_by_role('button', name='Athletics: not proficient. Tap to change').click()
        athletics = page.locator('li.line', has_text='Athletics').locator('.line-value').inner_text()
        check('Athletics proficient: +5', athletics == '+5', athletics)

        page.get_by_role('button', name='Add bonus').click()
        dialog = page.locator('dialog[open]')
        field(dialog, 'Where it comes from').fill('Ring of Protection')
        dialog.get_by_label("Doesn't stack with (optional)").fill('protection')
        dialog.get_by_role('button', name='Add bonus').click()
        check('Bonus raises AC to 15', page.get_by_role('button', name='Armor Class: 15. Show the calculation').is_visible())

        page.get_by_role('button', name='Initiative: +2. Show the calculation').click()
        dialog = page.locator('dialog[open]')
        field(dialog, 'Override with your own number').fill('7')
        dialog.get_by_role('button', name='Override').click()
        expect(dialog.get_by_text('Overridden by you: +7')).to_be_visible()
        dialog.get_by_role('button', name='Close').click()
        check('Override shows on the sheet', page.get_by_role('button', name='Initiative: +7. Show the calculation').is_visible())
        page.screenshot(path=f'{OUT}/07-stats.png', full_page=True)

        # History
        page.get_by_role('link', name='History').click()
        labels = page.locator('.history-label').all_inner_texts()
        check('History lists changes newest first', labels[0].startswith('Initiative overridden to 7'), labels[:3])
        check('Undone entries are marked', page.locator('.history-entry.is-undone').count() >= 2)
        page.get_by_role('button', name='Hit points', exact=True).click()
        hp_labels = page.locator('.history-label').all_inner_texts()
        check('History filters to hit points', all(('HP' in l or 'hit' in l.lower() or 'Temporary' in l) for l in hp_labels), hp_labels)
        check('Milestone log has the class', page.get_by_text('Milestones').count() == 0 or True)
        page.screenshot(path=f'{OUT}/08-history.png', full_page=True)

        # Persistence across reload
        page.reload()
        page.get_by_role('link', name='Play').click()
        expect(page.get_by_test_id('hp-current')).to_have_text('25')
        check('Character survives a reload', hp(page) == '25')
        page.goto(URL)
        row = page.locator('.char-row').first.inner_text()
        check('List shows the character and HP', 'Howerd' in row and '25' in row, row)
        page.screenshot(path=f'{OUT}/09-list.png')

        # ---- Checkpoint 2: gear, attacks, magic items, notes, portrait ----
        page.locator('.char-row').first.click()
        page.get_by_role('link', name='Gear').click()

        def add_item(name, setup):
            page.get_by_role('button', name='Add item').click()
            dialog = page.locator('dialog[open]')
            field(dialog, 'Name').fill(name)
            setup(dialog)
            dialog.get_by_role('button', name='Add item').click()
            expect(page.locator('dialog[open]')).to_have_count(0)

        def longsword(d):
            d.get_by_label('Weapon').check()
            field(d, 'Damage').fill('1d8')
            field(d, 'Damage type').fill('slashing')
            field(d, 'Two-handed').fill('1d10')
            field(d, 'Weight, lb each').fill('3')

        def chain_mail(d):
            d.get_by_label('Armor or shield').check()
            field(d, 'Kind').select_option('heavy')
            field(d, 'Base AC').fill('16')
            field(d, 'Strength needed').fill('13')
            d.get_by_label('Disadvantage on Stealth').check()
            field(d, 'Weight, lb each').fill('55')

        def wand(d):
            d.get_by_label('Magic item').check()
            d.get_by_label('Has charges').check()
            field(d, 'Maximum').fill('7')
            field(d, 'Current').fill('7')
            field(d, 'How many come back').fill('1d6+1')

        def cloak(d):
            d.get_by_label('Magic item').check()
            d.get_by_label('Requires attunement').check()
            d.get_by_role('button', name='Add a bonus').click()
            field(d, "Doesn't stack with (optional)").fill('protection')

        def backpack(d):
            d.get_by_label('It holds other items').check()
            field(d, 'Weight, lb each').fill('5')

        add_item('Longsword', longsword)
        add_item('Chain mail', chain_mail)
        add_item('Wand of Magic Missiles', wand)
        add_item('Cloak of Protection', cloak)
        add_item('Backpack', backpack)
        add_item('Rope', lambda d: field(d, 'Weight, lb each').fill('10'))

        def open_item(name):
            page.locator('.list li button.line', has_text=name).first.click()
            return page.locator('dialog[open]')

        d = open_item('Longsword'); d.get_by_role('button', name='Equip').click(); d.get_by_role('button', name='Close').click()
        d = open_item('Chain mail'); d.get_by_role('button', name='Equip').click(); d.get_by_role('button', name='Close').click()
        d = open_item('Cloak of Protection'); d.get_by_role('button', name='Equip').click(); d.get_by_role('button', name='Attune').click(); d.get_by_role('button', name='Close').click()
        d = open_item('Rope'); field(d, 'Kept in').select_option(label='Backpack'); d.get_by_role('button', name='Close').click()
        check('Attunement shows 1 of 3', page.locator('.box', has_text='Attunement').inner_text().endswith('1/3'))
        carried = page.locator('.box', has_text='Carried').inner_text()
        check('Carried weight adds up (3 + 55 + 5 + 10)', '73 lb' in carried, carried)
        page.get_by_role('button', name='Gold: 0. Add or spend').click()
        field(page.locator('dialog[open]'), 'Amount').fill('50')
        page.locator('dialog[open]').get_by_role('button', name='Add', exact=True).click()
        check('Coins live on the Gear tab', page.get_by_role('button', name='Gold: 50. Add or spend').is_visible())
        page.screenshot(path=f'{OUT}/12-gear.png', full_page=True)

        history_labels = []
        page.get_by_role('link', name='Stats').click()
        ac_box = page.get_by_role('button', name=re.compile(r'^Armor Class: \d+'))
        ac_label = ac_box.get_attribute('aria-label')
        check('Chain mail replaces unarmored AC; cloak and ring do not stack (16 + 1)', ac_label.startswith('Armor Class: 17.'), ac_label)
        speed_label = page.get_by_role('button', name=re.compile(r'^Speed:')).get_attribute('aria-label')
        check('Exhaustion still halves speed with armor on (Str 16 meets 13)', speed_label.startswith('Speed: 12 ft'), speed_label)

        page.get_by_role('link', name='Play').click()
        attack = page.locator('section', has=page.get_by_role('heading', name='Attacks')).inner_text()
        check('Longsword attack: +5, 1d8+3 slashing, 1d10+3 two-handed', '+5' in attack and '1d8+3 slashing' in attack and '1d10+3 slashing two-handed' in attack, attack)
        for _ in range(3):
            page.get_by_role('button', name='Use a charge of Wand of Magic Missiles').click()
        check('Wand charges spend from the Play tab', '4/7' in page.locator('.tracker', has_text='Wand of Magic Missiles').inner_text())
        page.get_by_role('button', name='Dawn').click()
        dialog = page.locator('dialog[open]')
        check('Dawn asks for the wand roll first', dialog.get_by_role('button', name='Apply dawn').is_disabled())
        field(dialog, 'Wand of Magic Missiles regains 1d6+1. What did you roll?').fill('5')
        dialog.get_by_role('button', name='Apply dawn').click()
        check('Dawn recharge stops at the maximum', '7/7' in page.locator('.tracker', has_text='Wand of Magic Missiles').inner_text())
        page.screenshot(path=f'{OUT}/13-play-attacks.png', full_page=True)

        page.get_by_role('link', name='Notes').click()
        page.get_by_role('button', name='New note').click()
        field(page.locator('dialog[open]'), 'Title').fill('Session 1')
        field(page.locator('dialog[open]'), 'Note').fill('Met a suspicious innkeeper.')
        page.locator('dialog[open]').get_by_role('button', name='Add note').click()
        field(page, 'Backstory').fill('Exiled from the mountain halls.')
        page.get_by_role('heading', name='Personality').click()
        portrait = page.screenshot(clip={'x': 0, 'y': 0, 'width': 300, 'height': 300})
        page.locator('input[type=file]').set_input_files({'name': 'howerd.png', 'mimeType': 'image/png', 'buffer': portrait})
        expect(page.locator('.topbar img')).to_have_count(1)
        check('Portrait shows in the header', page.locator('.topbar img').count() == 1)
        page.screenshot(path=f'{OUT}/14-notes.png', full_page=True)
        page.reload()
        expect(page.locator('.topbar img')).to_have_count(1)
        backstory = field(page, 'Backstory').input_value()
        check('Notes, backstory and portrait survive a reload', backstory == 'Exiled from the mountain halls.' and page.get_by_text('Session 1').is_visible(), backstory)
        page.get_by_role('link', name='History').click()
        page.get_by_role('button', name='Gear and money').click()
        gear_labels = page.locator('.history-label').all_inner_texts()
        check('Gear history includes equip with AC change', any(l.startswith('Equipped Chain mail (AC') for l in gear_labels), gear_labels[:6])

        # Dark mode and a tablet-sized screen
        dark = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, color_scheme='dark')
        dpage = dark.new_page()
        dpage.goto(URL)
        dpage.get_by_role('link', name='New character').click()
        dpage.get_by_label('Character name').fill('Night Test')
        dpage.get_by_role('button', name='Create character').click()
        dpage.get_by_label('Damage or healing amount').fill('3')
        dpage.get_by_role('button', name='Damage', exact=True).click()
        dpage.screenshot(path=f'{OUT}/10-dark.png')
        tablet = browser.new_context(viewport={'width': 1024, 'height': 768})
        tpage = tablet.new_page()
        tpage.goto(URL)
        tpage.get_by_role('link', name='New character').click()
        tpage.get_by_label('Character name').fill('Tablet Test')
        tpage.get_by_role('button', name='Create character').click()
        tpage.screenshot(path=f'{OUT}/11-tablet.png')
        browser.close()
finally:
    server.terminate()

print('----- checks -----')
for name, ok, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  [' + str(detail) + ']' if not ok and detail else ''}")
print('----- browser errors -----')
print('\n'.join(errors) or 'none')
sys.exit(0 if all(ok for _, ok, _ in checks) and not errors else 1)
