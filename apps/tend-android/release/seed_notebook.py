"""A sample Tend notebook for trying the app and taking screenshots: a week of phloem-model sessions.
Usage: seed_notebook.py 2026-10-29T10:30 -4 idle|running|review > notebook.json"""
import json, sys
from datetime import datetime, timedelta, timezone

# argv: local "now" as YYYY-MM-DDTHH:MM, UTC offset hours, and the timer mode (idle|running|review)
now = datetime.fromisoformat(sys.argv[1]).replace(tzinfo=timezone(timedelta(hours=float(sys.argv[2]))))
mode = sys.argv[3] if len(sys.argv) > 3 else 'idle'
monday = (now - timedelta(days=now.weekday())).replace(hour=9, minute=0)
iso = lambda d: d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
ms = lambda d: int(d.timestamp() * 1000)

plan = [  # (day, hour, minutes, completed, question, learned, stuck, next)
    (0, 9, 25, True, 'Which pools does the model treat as one?', 'Leaves are one pool; the fruit has its own unloading step.', '', 'Find where unloading is parameterised.'),
    (0, 10, 25, True, 'Where is the unloading rate set?', 'It is a Michaelis-Menten term in Methods 2.4.', 'Is the rate measured or fitted?', 'Check the supplement for the fit.'),
    (0, 14, 25, True, 'Was the unloading rate fitted?', 'Fitted to 2019 fruit growth data.', '', 'Compare with the 2022 model.'),
    (1, 9, 25, True, 'How does the 2022 model split sugar?', 'Two sinks share one phloem stream.', 'Units differ between papers.', 'Convert both to mmol per hour.'),
    (1, 11, 25, True, 'Do the units agree after conversion?', 'Within 10 percent at midday.', '', 'Plot both over a day.'),
    (1, 15, 25, False, 'Why do the curves diverge at night?', 'Starch release is missing in one model.', '', ''),
    (2, 10, 25, True, 'How is starch release modelled?', 'A first-order release after dusk.', 'Rate constant source unclear.', 'Email the authors about k.'),
    (2, 13, 25, True, 'Can I add starch release to the 2019 model?', '', '', 'Sketch the extra equation.'),
    (3, 9, 25, True, 'How does the phloem model split sugar between fruit and leaves?', 'Fruit unloading dominates after flowering.', 'Is the unloading rate measured or fitted?', 'Check Methods 2.4 for the unloading rate.'),
]
sessions = []
for i, (day, hour, minutes, done, q, learned, stuck, nxt) in enumerate(plan):
    start = monday + timedelta(days=day, hours=hour - 9)
    if start + timedelta(minutes=minutes) > now: continue
    sessions.append({'id': f'seed-{i}', 'question': q, 'finish': 'One clear distinction' if i == 8 else '',
                     'startedAt': iso(start), 'endedAt': iso(start + timedelta(minutes=minutes if done else 17)),
                     'durationMs': (minutes if done else 17) * 60000, 'completed': done, 'learned': learned, 'stuck': stuck, 'next': nxt})

question = 'How does the phloem model split sugar between fruit and leaves?'
timer = {'phase': 'focus', 'status': 'idle', 'durationMs': 1500000, 'remainingMs': 1500000, 'endAt': None, 'startedAt': None, 'id': None, 'task': None}
pending = None
if mode == 'running':  # nine and a half minutes in, so the tomato is half-ripe
    started = now - timedelta(minutes=9, seconds=30)
    timer = {'phase': 'focus', 'status': 'running', 'durationMs': 1500000, 'remainingMs': 1500000, 'endAt': ms(started) + 1500000,
             'startedAt': ms(started), 'id': 'now', 'task': {'question': question, 'finish': 'One clear distinction'}}
if mode == 'review':
    started = now - timedelta(minutes=25)
    timer = {'phase': 'focus', 'status': 'review', 'durationMs': 1500000, 'remainingMs': 0, 'endAt': None,
             'startedAt': ms(started), 'id': 'now', 'task': {'question': question, 'finish': ''}}
    pending = {'id': 'now', 'question': question, 'finish': '', 'startedAt': iso(started), 'endedAt': iso(now), 'durationMs': 1500000,
               'completed': True, 'learned': 'Leaves are one pool; the fruit has its own unloading step.',
               'stuck': 'Is the unloading rate measured or fitted?', 'next': 'Check Methods 2.4 for the unloading rate.'}

print(json.dumps({
    'schema': 'tend-focus-v1', 'settings': {'focus': 25, 'short': 5, 'long': 15, 'sound': True, 'keepAwake': False, 'notify': False},
    'plan': 'A one-page comparison of how three tomato models move sugar to the fruit.',
    'task': {'question': question, 'finish': 'One clear distinction'},
    'later': [{'id': 'l1', 'text': 'Email the authors about the rate constant k', 'done': False},
              {'id': 'l2', 'text': 'Look up the 2022 supplement tables', 'done': False},
              {'id': 'l3', 'text': 'Renew library loan', 'done': True}],
    'sessions': sessions, 'completedCount': sum(s['completed'] for s in sessions), 'timer': timer, 'pending': pending
}))
