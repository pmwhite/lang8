# Which steps to take, with his height and fall carried from step to step: dynamic programming over
# (which foot next, speed, angle off the stick's way, height, fall), the steps those of
# envelope2.py, each taking him from one such state to the next.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
from envelope2 import SPEEDS, YS, VYS

env = pickle.load(open('/tmp/chr/gen/envelope2.pkl', 'rb'))
TGRID = np.radians(np.arange(0.0, 180.1, 5.0))
EFFORT = 0.0005
DRIFT = 0.4
LOW = 3.0
CROSS = 0.12
SP = np.array(SPEEDS); YA = np.array(YS); VA = np.array(VYS)

def nearest(a, x):
    return np.abs(a[None, :] - np.asarray(x)[:, None]).argmin(1)

def acts(v, y, vy):
    A = env[(v, y, vy)]
    # (only those landing him within the heights and falls planned over)
    if len(A): A = A[(A[:, 11] >= VA.min() - 0.2) & (A[:, 11] <= VA.max() + 0.2) & (A[:, 10] >= YA.min() - 0.04) & (A[:, 10] <= YA.max() + 0.04)]
    if len(A) == 0: return A, np.zeros(0)
    cost = A[:, 2] + EFFORT * A[:, 3]
    # (thinned: the cheapest in each cell of velocity change and where he lands)
    keys = (np.round(A[:, 0] / 0.25).astype(int) * 100000 + np.round(A[:, 1] / 0.25).astype(int) * 100
            + nearest(YA, A[:, 10]) * 10 + nearest(VA, A[:, 11]))
    best = {}
    for i, k in enumerate(keys):
        if k not in best or cost[i] < cost[best[k]]: best[k] = i
    idx = np.array(sorted(best.values()))
    B = A[idx]; M = B.copy(); M[:, 0] = -M[:, 0]; M[:, 5] = -M[:, 5]
    return np.vstack([B, M]), np.concatenate([cost[idx], cost[idx]])

def solve(target, sweeps=80):
    nS, nT, nY, nV = len(SP), len(TGRID), len(YA), len(VA)
    V = np.full((2, nS, nT, nY, nV), 60.0); pol = np.full((2, nS, nT, nY, nV), -1)
    ACT = {}
    for si, v in enumerate(SP):
        for yi, y in enumerate(YA):
            for wi, w in enumerate(VA):
                A, C = acts(v, y, w)
                if len(A) == 0: ACT[(si, yi, wi)] = None; continue
                ACT[(si, yi, wi)] = (A, C, nearest(YA, A[:, 10]), nearest(VA, A[:, 11]))
    def done(s, th):
        if target < 0.5: return s < 0.5
        return abs(s - target) <= max(0.45, 0.06 * target) and (th <= math.radians(7) or s < 0.5)
    for si, s in enumerate(SP):
        for ti, th in enumerate(TGRID):
            if done(s, th): V[:, si, ti] = 0.0
    for sweep in range(sweeps):
        changed = 0.0
        for (si, yi, wi), entry in ACT.items():
            if entry is None: continue
            A, C, y2, w2 = entry; s = SP[si]
            nx, nz = A[:, 0], s + A[:, 1]
            ns = np.hypot(nx, nz); ang = np.arctan2(nx, nz)
            si2 = nearest(SP, ns)
            for par in (0, 1):
                ok = (A[:, 5] >= -CROSS) if par == 0 else (A[:, 5] <= CROSS)
                for ti, th in enumerate(TGRID):
                    if done(s, th): continue
                    if s < 0.3:
                        nth = np.abs(np.arctan2(nx, np.maximum(nz, 1e-6)))
                    else:
                        nth = np.abs(((ang + th) + math.pi) % (2 * math.pi) - math.pi)
                    ti2 = np.clip(np.round(np.degrees(nth) / 5.0).astype(int), 0, nT - 1)
                    sthe = math.sin(min(th, math.pi / 2)); cthe = max(-s * math.cos(th), 0.0)
                    drift = 0.5 * (s * sthe + ns * np.sin(np.minimum(nth, math.pi / 2))) * A[:, 2]
                    back = 0.5 * (cthe + np.maximum(-ns * np.cos(nth), 0.0)) * A[:, 2]
                    away = np.maximum(nth - th, 0.0) * (ns > 0.5)
                    if target < 0.5: drift = drift * 0.0
                    # (running low is hard work)
                    low = np.maximum(1.03 - 0.004 * np.minimum(ns, 10.0) - A[:, 10], 0.0)
                    tot = C + DRIFT * (drift + back) + 0.6 * away + LOW * low * low * A[:, 2] * 10.0 + V[1 - par, si2, ti2, y2, w2]
                    tot = np.where(ok, tot, 1e9)
                    k = int(np.argmin(tot))
                    if tot[k] < V[par, si, ti, yi, wi] - 1e-6:
                        changed = max(changed, V[par, si, ti, yi, wi] - tot[k])
                        V[par, si, ti, yi, wi] = tot[k]; pol[par, si, ti, yi, wi] = k
        if changed < 1e-3: break
    return V, pol, {k: (e[0] if e else None) for k, e in ACT.items()}

if __name__ == '__main__':
    out = {}
    for target in [float(x) for x in sys.argv[1:]] or [0.0, 3.5, 6.0, 9.5]:
        V, pol, ACT = solve(target)
        out[target] = (V, pol, ACT)
        print('stick at', target, flush=True)
    pickle.dump(out, open('/tmp/chr/gen/policy2.pkl', 'wb'))
