"""
Escape Grid environment for RL training — v2 with trap placement.

The agent controls BOTH phases:
  Setup phase: place 6 traps one at a time (actions 0-13 = which of 14 valid cells)
  Play  phase: control hunter movement/attacks (actions 0-7)

A single DQN with 14 outputs handles both phases; the phase flag in the state
and the valid-action mask tell it which interpretation applies.

State vector (62 dims):
  [0]     is_play_phase  (0.0 during setup, 1.0 during play)
  [1]     traps_left / 6 (how many traps remain to place)
  [2:16]  trap at each TRAP_CELL (see TRAP_VAL; 0.0 = empty)
  [16:19] hunter x/3, y/3, hp/16
  [19:35] 4 participants × (alive, x/3, y/3, hp/5)
  [35:59] 24 doors (fixed DOOR_ORDER) — locked=0, closed=0.33, open=1, frozen=-0.33
  [59:61] hunter_moves/4, hunter_attacks
  [61]    round/20 (capped)

Actions (14 total):
  Setup:  0-13  → place current trap at TRAP_CELLS[action]
  Play:   0=move_up, 1=move_down, 2=move_left, 3=move_right,
          4=attack, 5=unlock, 6=open_door, 7=pass   (8-13 masked)
"""

import numpy as np
from collections import deque
import random

GRID = 4
EXIT = (3, 3)

# Door states
LOCKED = 0; CLOSED = 1; OPEN = 2; FROZEN = 3

# Action indices
MOVE_UP=0; MOVE_DOWN=1; MOVE_LEFT=2; MOVE_RIGHT=3
ATTACK=4; UNLOCK=5; OPEN_DOOR=6; PASS=7
N_ACTIONS = 14   # 14 during setup, 8 during play (8-13 masked)

ACTION_NAMES = ['move_up','move_down','move_left','move_right',
                'attack','unlock','open_door','pass',
                'trap8','trap9','trap10','trap11','trap12','trap13']

# Traps placed in this fixed order during setup phase
SETUP_TRAPS = ['XX','XX','☆','■','+','△']

# 14 valid trap cells (row-major, skip start (0,0) and exit (3,3))
TRAP_CELLS = [(x,y) for y in range(GRID) for x in range(GRID)
              if (x,y)!=(0,0) and (x,y)!=EXIT]  # 14 entries

# How each trap encodes in the state vector (from hunter's perspective)
TRAP_VAL = {'XX':0.3, '☆':1.0, '■':0.6, '+': -0.5, '△': -0.3}

# Fixed door enumeration — MUST match JS DOOR_ORDER_PAIRS
DOOR_ORDER = []
for _x in range(GRID):
    for _y in range(GRID):
        if _x+1 < GRID: DOOR_ORDER.append((_x,_y,_x+1,_y))
        if _y+1 < GRID: DOOR_ORDER.append((_x,_y,_x,_y+1))
# 24 entries

DOOR_ENC = {LOCKED:0.0, CLOSED:0.33, OPEN:1.0, FROZEN:-0.33}

STATE_DIM = 1 + 1 + len(TRAP_CELLS) + 3 + 4*4 + len(DOOR_ORDER) + 2 + 1  # = 62


def dkey(x1,y1,x2,y2):
    if x1>x2 or (x1==x2 and y1>y2): return (x2,y2,x1,y1)
    return (x1,y1,x2,y2)

def init_doors():
    return {dkey(x1,y1,x2,y2): LOCKED for (x1,y1,x2,y2) in DOOR_ORDER}

def adj_cells(x,y):
    for dx,dy in [(0,-1),(0,1),(-1,0),(1,0)]:
        nx,ny = x+dx, y+dy
        if 0<=nx<GRID and 0<=ny<GRID: yield nx,ny


class Unit:
    def __init__(self, uid, hp):
        self.id=uid; self.hp=hp; self.max_hp=hp
        self.x=0; self.y=0; self.has_revive=False; self.escaped=False


class EscapeGridEnv:
    def __init__(self, greedy_prob=0.7):
        self.greedy_prob = greedy_prob

    def reset(self):
        self.doors   = init_doors()
        self.frozen  = set()
        self.traps   = {}          # {(x,y): trap_type}
        self.round   = 0
        self.stun_h  = 0
        self.stun_p  = 0

        self.participants = [Unit(i,5) for i in range(4)]
        self.hunter = Unit('H',16)
        self.hunter_moves   = 4
        self.hunter_attacks = 1

        # Setup phase state
        self.phase       = 'setup'   # 'setup' | 'play'
        self.trap_idx    = 0         # which trap in SETUP_TRAPS we're placing next

        self.done   = False
        self.winner = None
        return self._state()

    # ── State vector ───────────────────────────────────────
    def _state(self):
        s = []
        s.append(1.0 if self.phase=='play' else 0.0)
        s.append((len(SETUP_TRAPS)-self.trap_idx) / len(SETUP_TRAPS))
        # Trap cells
        for pos in TRAP_CELLS:
            s.append(TRAP_VAL.get(self.traps.get(pos,''),0.0))
        # Hunter
        h = self.hunter
        s += [h.x/3, h.y/3, h.hp/16]
        # Participants
        for p in self.participants:
            alive = 1.0 if p.hp>0 and not p.escaped else 0.0
            s += [alive, p.x/3, p.y/3, p.hp/5]
        # Doors
        for (x1,y1,x2,y2) in DOOR_ORDER:
            k = dkey(x1,y1,x2,y2)
            st = FROZEN if k in self.frozen else self.doors.get(k,OPEN)
            s.append(DOOR_ENC[st])
        # Action budget
        s += [self.hunter_moves/4, float(self.hunter_attacks)]
        s.append(min(self.round,20)/20)
        return np.array(s, dtype=np.float32)

    # ── Valid action mask ──────────────────────────────────
    def valid_actions(self):
        mask = np.zeros(N_ACTIONS, dtype=bool)
        if self.phase == 'setup':
            # Valid: any TRAP_CELLS index not already occupied
            occupied = set(self.traps.keys())
            for i,pos in enumerate(TRAP_CELLS):
                if pos not in occupied: mask[i] = True
        else:
            h = self.hunter
            if self.hunter_moves > 0:
                for a,(dx,dy) in enumerate([(0,-1),(0,1),(-1,0),(1,0)]):
                    nx,ny = h.x+dx, h.y+dy
                    if 0<=nx<GRID and 0<=ny<GRID:
                        k = dkey(h.x,h.y,nx,ny)
                        if k not in self.frozen and self.doors.get(k)==OPEN:
                            mask[a] = True
                for nx,ny in adj_cells(h.x,h.y):
                    k = dkey(h.x,h.y,nx,ny)
                    if k not in self.frozen:
                        if self.doors.get(k)==LOCKED: mask[UNLOCK]   = True
                        if self.doors.get(k)==CLOSED: mask[OPEN_DOOR]= True
            if self.hunter_attacks>0 and self.round>0:
                living = [p for p in self.participants if p.hp>0 and not p.escaped]
                if any(p.x==h.x and p.y==h.y for p in living):
                    mask[ATTACK] = True
            mask[PASS] = True
        return mask

    # ── Step ───────────────────────────────────────────────
    def step(self, action):
        if self.done: return self._state(), 0.0, True, {'winner':self.winner}

        if self.phase == 'setup':
            reward = self._setup_step(action)
        else:
            reward = self._play_step(action)

        self._check_win()
        return self._state(), reward, self.done, {'winner':self.winner}

    # ── Setup phase ────────────────────────────────────────
    def _setup_step(self, action):
        if action >= len(TRAP_CELLS): return -0.2
        pos = TRAP_CELLS[action]
        if pos in self.traps: return -0.2   # tried to double-place

        self.traps[pos] = SETUP_TRAPS[self.trap_idx]
        self.trap_idx += 1

        if self.trap_idx >= len(SETUP_TRAPS):
            self.phase = 'play'

        # No placement reward — agent must discover good placement
        # purely from downstream game outcomes (kills, escapes, wins).
        return 0.0

    # ── Play phase ─────────────────────────────────────────
    def _play_step(self, action):
        reward = -0.05  # step cost

        if   action==MOVE_UP:    reward += self._h_move(0,-1)
        elif action==MOVE_DOWN:  reward += self._h_move(0, 1)
        elif action==MOVE_LEFT:  reward += self._h_move(-1,0)
        elif action==MOVE_RIGHT: reward += self._h_move( 1,0)
        elif action==ATTACK:     reward += self._h_attack()
        elif action==UNLOCK:     reward += self._h_door(LOCKED,CLOSED)
        elif action==OPEN_DOOR:  reward += self._h_door(CLOSED,OPEN)
        elif action==PASS:
            self.hunter_moves=0; self.hunter_attacks=0

        if self.hunter_moves<=0 and self.hunter_attacks<=0:
            reward += self._participant_turns()
            if not self.done: self._start_hunter_turn()

        return reward

    def _h_move(self,dx,dy):
        h=self.hunter; nx,ny=h.x+dx,h.y+dy
        if not(0<=nx<GRID and 0<=ny<GRID): return -0.1
        k=dkey(h.x,h.y,nx,ny)
        if k in self.frozen or self.doors.get(k)!=OPEN: return -0.1
        h.x,h.y=nx,ny; self.hunter_moves-=1
        return self._proximity_bonus()

    def _proximity_bonus(self):
        living=[p for p in self.participants if p.hp>0 and not p.escaped]
        if not living: return 0.0
        h=self.hunter
        best=min(abs(p.x-h.x)+abs(p.y-h.y) for p in living)
        return 0.05/(best+1)

    def _h_attack(self):
        if self.round==0: return -0.2
        h=self.hunter
        targets=[p for p in self.participants if p.hp>0 and not p.escaped
                 and p.x==h.x and p.y==h.y]
        if not targets: return -0.1
        t=targets[0]; t.hp=max(0,t.hp-3); self.hunter_attacks-=1
        if t.hp<=0:
            if t.has_revive: t.has_revive=False; t.hp=1; return 2.0
            return 10.0
        return 1.5

    def _h_door(self,from_st,to_st):
        h=self.hunter
        for nx,ny in adj_cells(h.x,h.y):
            k=dkey(h.x,h.y,nx,ny)
            if k not in self.frozen and self.doors.get(k)==from_st:
                self.doors[k]=to_st; self.hunter_moves-=1; return 0.05
        return -0.1

    # ── Participant turns (AI-controlled) ──────────────────
    def _participant_turns(self):
        reward=0.0
        for p in self.participants:
            if p.hp<=0 or p.escaped or self.done: continue
            if self.stun_p>0: self.stun_p-=1; continue
            # Move
            if random.random()<self.greedy_prob: reward+=self._part_greedy(p)
            else:                                reward+=self._part_random(p)
            if self.done: return reward
            # Attack hunter
            if p.x==self.hunter.x and p.y==self.hunter.y:
                self.hunter.hp=max(0,self.hunter.hp-2)
                if self.hunter.hp<=0:
                    if self.hunter.has_revive: self.hunter.has_revive=False; self.hunter.hp=1
                    else: self.winner='participants'; self.done=True; reward-=30.0; return reward
        self.round+=1
        return reward

    def _part_greedy(self,p):
        path=self._bfs(p.x,p.y,*EXIT)
        if not path: return 0.0
        nx,ny=path[0]; k=dkey(p.x,p.y,nx,ny)
        if k in self.frozen: return 0.0
        st=self.doors.get(k)
        if st==OPEN: p.x,p.y=nx,ny; return self._apply_trap(p)
        elif st==LOCKED: self.doors[k]=CLOSED
        elif st==CLOSED: self.doors[k]=OPEN
        return 0.0

    def _part_random(self,p):
        opts=[(nx,ny) for nx,ny in adj_cells(p.x,p.y)
              if dkey(p.x,p.y,nx,ny) not in self.frozen
              and self.doors.get(dkey(p.x,p.y,nx,ny))==OPEN]
        if opts: nx,ny=random.choice(opts); p.x,p.y=nx,ny; return self._apply_trap(p)
        return 0.0

    def _apply_trap(self,p):
        pos=(p.x,p.y)
        if pos==EXIT: p.escaped=True; self.winner='participants'; self.done=True; return -20.0
        if pos not in self.traps: return 0.0
        trap=self.traps[pos]
        if trap=='XX': p.hp=max(0,p.hp-1)
        elif trap=='☆':
            if p.has_revive: p.has_revive=False; p.hp=max(p.hp,1)
            else: p.hp=0
            del self.traps[pos]
        elif trap=='■':
            for nx,ny in adj_cells(p.x,p.y): self.frozen.add(dkey(p.x,p.y,nx,ny))
            del self.traps[pos]
        elif trap=='+': self.stun_h+=1; del self.traps[pos]
        elif trap=='△': p.has_revive=True; del self.traps[pos]
        return 0.0

    def _start_hunter_turn(self):
        if self.stun_h>0: self.stun_h-=1; self.hunter_moves=0; self.hunter_attacks=0
        else: self.hunter_moves=4; self.hunter_attacks=1

    # ── Win / deadlock check ───────────────────────────────
    def _check_win(self):
        if self.done: return
        living=[p for p in self.participants if p.hp>0 and not p.escaped]
        if any(p.escaped for p in self.participants): self.done=True; self.winner='participants'; return
        if self.hunter.hp<=0: self.done=True; self.winner='participants'; return
        if not living: self.done=True; self.winner='hunter'; return
        # Deadlock
        if self.phase=='play' and all(not self._part_can_act(p) for p in living):
            if not any(self._bfs(self.hunter.x,self.hunter.y,p.x,p.y) for p in living):
                self.done=True; self.winner='hunter'

    def _part_can_act(self,p):
        if p.x==self.hunter.x and p.y==self.hunter.y: return True
        return any(dkey(p.x,p.y,nx,ny) not in self.frozen for nx,ny in adj_cells(p.x,p.y))

    def _bfs(self,sx,sy,ex,ey):
        if sx==ex and sy==ey: return []
        q=deque([(sx,sy,[])]); vis={(sx,sy)}
        while q:
            x,y,path=q.popleft()
            for nx,ny in adj_cells(x,y):
                if (nx,ny) in vis: continue
                k=dkey(x,y,nx,ny)
                if k in self.frozen: continue
                vis.add((nx,ny)); np_=(nx,ny); new=path+[(nx,ny)]
                if nx==ex and ny==ey: return new
                q.append((nx,ny,new))
        return None
