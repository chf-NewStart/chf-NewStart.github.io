#!/usr/bin/env python3
"""Shoot App Store screenshots of the Debug build in a booted simulator, through the DEBUG launch hooks.

usage: python3 apps/tend-ios/scripts/shoot.py <simulator-udid> <out-dir> [path/to/Tend.app]
Builds nothing: install a Debug build first (or pass its path). One simulator at a time.
"""
import json, subprocess, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

udid, out = sys.argv[1], Path(sys.argv[2])
app = sys.argv[3] if len(sys.argv) > 3 else None
out.mkdir(parents=True, exist_ok=True)
MIN = 60000
# The room's clock is set to Thursday 9:41 of this week (DEBUG -tendNow), matching the status bar, so the
# notebook shows a few days of work.
local = datetime.now().astimezone()
thursday = (local - timedelta(days=local.weekday()) + timedelta(days=3)).replace(hour=9, minute=41, second=0, microsecond=0)
now = int(thursday.timestamp() * 1000)

QUESTION = 'How does the phloem model split sugar between fruit and leaves?'
iso = lambda ms: datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z')
def session(i, minutes_ago, question, learned, stuck, next_step, length=25):
    end = now - minutes_ago * MIN
    return {'id': f'demo-{i}', 'question': question, 'finish': '', 'startedAt': iso(end - length * MIN), 'endedAt': iso(end),
            'durationMs': length * MIN, 'completed': True, 'learned': learned, 'stuck': stuck, 'next': next_step}
H = 60
SESSIONS = [
    session(1, 3 * 24 * H - 35, 'What does the transport equation conserve?', 'Mass, but only along the stem; leaves are lumped.', '', 'Sketch the lumped compartments.'),
    session(2, 3 * 24 * H - 5 * H, 'Which assumption keeps sink strength constant in the model?', 'It is a fitted parameter, not an output of growth.', 'Whether it should change with fruit age.', 'Read the 2022 supplement, table S3.', 50),
    session(3, 2 * 24 * H - 20, 'Read the 2022 supplement, table S3', 'Sink strength is fitted per truss, then held fixed.', '', 'Compare with the 2017 model.'),
    session(4, 2 * 24 * H - 4 * H, 'Compare unloading in the two fruit models', 'One unloads symplastically, the other through the apoplast.', 'Which one matches the 2017 respiration data?', 'Plot both against the data.', 50),
    session(5, 24 * H - 6 * H, 'Plot both models against the 2017 data', 'The apoplastic route fits late ripening better.', 'Early fruit is off in both.', 'Check the early-fruit respiration term.'),
    session(6, 26, QUESTION, 'Leaves are one pool; the fruit has its own unloading step.', '', 'Check Methods 2.4 for the unloading rate.'),
]
def state(timer=None, pending=None, sessions=(), plan='', later=()):
    base = {'schema': 'tend-focus-v1', 'settings': {'focus': 25, 'short': 5, 'long': 15, 'sound': True, 'keepAwake': False, 'notify': False},
            'plan': plan, 'task': {'question': QUESTION, 'finish': 'One clear distinction between the two routes.'},
            'later': [{'id': f'l{i}', 'text': t, 'done': d} for i, (t, d) in enumerate(later)], 'sessions': list(sessions),
            'completedCount': len(sessions), 'pending': pending,
            'timer': timer or {'phase': 'focus', 'status': 'idle', 'durationMs': 25 * MIN, 'remainingMs': 25 * MIN, 'endAt': None, 'startedAt': None, 'id': None, 'task': None}}
    return base
def running(left_min, total=25):
    return {'phase': 'focus', 'status': 'running', 'durationMs': total * MIN, 'remainingMs': total * MIN, 'endAt': now + left_min * MIN,
            'startedAt': now - (total - left_min) * MIN, 'id': 'demo-run', 'task': {'question': QUESTION, 'finish': 'One clear distinction between the two routes.'}}

LATER = [('Ask the lab for the greenhouse sensor logs', False), ('That 1999 nitrate influx paper', False), ('Rename the figure files', True)]
PLAN = 'A one-page comparison of how three tomato models move sugar to the fruit.'
SCENES = [
    ('1-focus', state(running(10), sessions=SESSIONS, later=LATER[:1]), "window.scrollTo(0, 0)"),
    ('2-quiet', state(running(17), sessions=SESSIONS), "document.getElementById('quiet-open').click()"),
    ('3-reflect', state({**running(0), 'status': 'review', 'remainingMs': 0, 'endAt': None},
                        pending={**session(9, 0, QUESTION, 'Leaves are one pool; the fruit has its own unloading step.', 'Is the unloading rate measured or fitted?', 'Check Methods 2.4 for the unloading rate.'), 'endedAt': iso(now)},
                        sessions=SESSIONS), ""),
    ('4-notebook', state(sessions=SESSIONS, plan=PLAN, later=LATER), "document.getElementById('tab-notebook').click()"),
    ('5-sources', state(sessions=SESSIONS), "document.getElementById('tab-sources').click()"),
]

def run(*args, check=True):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, capture_output=True, text=True)
if app: run('install', udid, app)
run('status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100', '--wifiBars', '3', '--cellularBars', '4', check=False)
for name, seed, script in SCENES:
    run('terminate', udid, 'com.houfu72.tend', check=False)
    # Hide the scrollbar flash and the caret so every shot is clean.
    tidy = "document.activeElement && document.activeElement.blur();"
    run('launch', udid, 'com.houfu72.tend', '-tendNow', str(now), '-tendState', json.dumps(seed), '-tendEval', f"{script}; {tidy} 'ok'")
    time.sleep(4)
    run('io', udid, 'screenshot', str(out / f'{name}.png'))
    print('shot', name)
run('terminate', udid, 'com.houfu72.tend', check=False)
