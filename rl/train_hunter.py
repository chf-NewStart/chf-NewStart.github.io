"""
DQN training for the RL hunter.

Usage:
    cd rl/
    pip install -r requirements.txt
    python train_hunter.py

Output:
    hunter_weights.pt   — PyTorch checkpoint (for resuming)
    ../game/hunter_rl.json — weights exported for browser inference
"""

import json
import os
import random
import signal
import sys
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from escape_env import EscapeGridEnv, N_ACTIONS, STATE_DIM, ACTION_NAMES

# ── Hyperparameters ────────────────────────────────────────
HIDDEN       = 128
LR           = 1e-3
GAMMA        = 0.95
BATCH        = 64
BUF_SIZE     = 60_000
EPS_START    = 1.0
EPS_END      = 0.05
EPS_DECAY    = 0.9995    # per episode
TARGET_SYNC  = 300       # steps between target net updates
MAX_EPISODES = 8_000
MAX_STEPS    = 260       # 6 setup placements + 4 moves+1 atk × ~50 rounds
PRINT_EVERY  = 100
SAVE_EVERY   = 500
CHECKPOINT   = 'hunter_weights.pt'
EXPORT_PATH  = '../game/hunter_rl.json'


# ── Network ────────────────────────────────────────────────
class DQN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(STATE_DIM, HIDDEN), nn.ReLU(),
            nn.Linear(HIDDEN,    HIDDEN), nn.ReLU(),
            nn.Linear(HIDDEN,    N_ACTIONS),
        )

    def forward(self, x):
        return self.net(x)


# ── Replay buffer ──────────────────────────────────────────
class ReplayBuffer:
    def __init__(self, capacity):
        self.buf = deque(maxlen=capacity)

    def push(self, s, a, r, s2, done):
        self.buf.append((s, a, float(r), s2, float(done)))

    def sample(self, n):
        batch = random.sample(self.buf, n)
        s, a, r, s2, d = zip(*batch)
        return (np.array(s, dtype=np.float32),
                np.array(a, dtype=np.int64),
                np.array(r, dtype=np.float32),
                np.array(s2, dtype=np.float32),
                np.array(d, dtype=np.float32))

    def __len__(self):
        return len(self.buf)


# ── Weight export ──────────────────────────────────────────
def export_weights(model, path):
    layers = [l for l in model.net if isinstance(l, nn.Linear)]
    data = {
        'version':      2,
        'state_dim':    STATE_DIM,
        'action_dim':   N_ACTIONS,
        'hidden':       HIDDEN,
        'action_names': ACTION_NAMES,
        'weights':      [l.weight.detach().cpu().tolist() for l in layers],
        'biases':       [l.bias.detach().cpu().tolist()   for l in layers],
    }
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'  → exported {path}  ({os.path.getsize(path)//1024} KB)')


# ── Training loop ──────────────────────────────────────────
def train():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Device: {device}  |  state_dim={STATE_DIM}  |  actions={N_ACTIONS}')

    q_net    = DQN().to(device)
    q_target = DQN().to(device)
    q_target.load_state_dict(q_net.state_dict())
    q_target.eval()

    # Resume from checkpoint if available
    start_ep = 0
    if os.path.exists(CHECKPOINT):
        q_net.load_state_dict(torch.load(CHECKPOINT, map_location=device))
        q_target.load_state_dict(q_net.state_dict())
        print(f'Resumed from {CHECKPOINT}')

    optimizer = optim.Adam(q_net.parameters(), lr=LR)
    buf       = ReplayBuffer(BUF_SIZE)
    env       = EscapeGridEnv(greedy_prob=0.7)

    eps           = EPS_START
    total_steps   = 0
    win_hist      = deque(maxlen=200)
    reward_hist   = deque(maxlen=200)

    # Save on Ctrl+C
    def save_and_exit(sig, frame):
        print('\nInterrupted — saving...')
        torch.save(q_net.state_dict(), CHECKPOINT)
        export_weights(q_net, EXPORT_PATH)
        sys.exit(0)
    signal.signal(signal.SIGINT, save_and_exit)

    print(f'Training for {MAX_EPISODES} episodes...\n')

    for ep in range(start_ep, MAX_EPISODES):
        state = env.reset()   # always starts in setup phase (agent places traps first)
        ep_reward = 0.0

        for _ in range(MAX_STEPS):
            mask = env.valid_actions()

            # ε-greedy with invalid-action masking
            if random.random() < eps:
                action = int(random.choice(np.where(mask)[0]))
            else:
                with torch.no_grad():
                    q = q_net(torch.FloatTensor(state).unsqueeze(0).to(device)).cpu().numpy()[0]
                    q[~mask] = -1e9
                    action = int(np.argmax(q))

            next_state, reward, done, info = env.step(action)
            buf.push(state, action, reward, next_state, done)
            state = next_state
            ep_reward += reward
            total_steps += 1

            # ── SGD update ────────────────────────────────
            if len(buf) >= BATCH:
                s, a, r, s2, d = buf.sample(BATCH)
                s_t  = torch.FloatTensor(s).to(device)
                s2_t = torch.FloatTensor(s2).to(device)
                a_t  = torch.LongTensor(a).to(device)
                r_t  = torch.FloatTensor(r).to(device)
                d_t  = torch.FloatTensor(d).to(device)

                q_cur = q_net(s_t).gather(1, a_t.unsqueeze(1)).squeeze(1)
                with torch.no_grad():
                    q_nxt = q_target(s2_t).max(1)[0]
                    target = r_t + GAMMA * q_nxt * (1 - d_t)

                loss = nn.SmoothL1Loss()(q_cur, target)
                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(q_net.parameters(), 10.0)
                optimizer.step()

            if total_steps % TARGET_SYNC == 0:
                q_target.load_state_dict(q_net.state_dict())

            if done:
                break

        eps = max(EPS_END, eps * EPS_DECAY)
        won = info.get('winner') == 'hunter'
        win_hist.append(int(won))
        reward_hist.append(ep_reward)

        if (ep + 1) % PRINT_EVERY == 0:
            wr  = np.mean(win_hist)
            avg = np.mean(reward_hist)
            print(f'ep {ep+1:5d} | ε={eps:.3f} | win={wr:.1%} | avg_r={avg:7.2f} | buf={len(buf)}')

        if (ep + 1) % SAVE_EVERY == 0:
            torch.save(q_net.state_dict(), CHECKPOINT)
            export_weights(q_net, EXPORT_PATH)

    # Final save
    torch.save(q_net.state_dict(), CHECKPOINT)
    export_weights(q_net, EXPORT_PATH)
    print('\nDone.')


if __name__ == '__main__':
    train()
