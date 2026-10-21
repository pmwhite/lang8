# Which steps to take: from any speed and any angle off the way the stick says, the quickest run
# of steps (each one he can take: envelope.py) to going that way at the stick's speed. Dynamic
# programming over (speed, angle), for a few stick speeds.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')

env = pickle.load(open('/tmp/chr/gen/envelope.pkl', 'rb'))
ESPEEDS = sorted(env)
SGRID = np.arange(0.0, 10.41, 0.25)
TGRID = np.radians(np.arange(0.0, 180.1, 5.0))
EFFORT = 0.0005     # seconds a unit of effort is worth
HABIT = 0.05
DRIFT = 1.5        # seconds a metre off the stick's line is worth

def actions(s):
    # the steps he can take at about speed s, thinned: in each cell of velocity change the cheapest
    v = min(ESPEEDS, key=lambda e: abs(e - s))
    A = env[v]
    cost = A[:, 2] + EFFORT * A[:, 3] + HABIT * A[:, 5]
    keys = np.round(A[:, 0] / 0.2).astype(int) * 1000 + np.round(A[:, 1] / 0.2).astype(int)
    best = {}
    for i, k in enumerate(keys):
        if k not in best or cost[i] < cost[best[k]]: best[k] = i
    idx = np.array(sorted(best.values()))
    # (both ways sideways: he can do on one side what he can on the other)
    B = A[idx]; M = B.copy(); M[:, 0] = -M[:, 0]; M[:, 7] = -M[:, 7]
    return np.vstack([B, M]), np.concatenate([cost[idx], cost[idx]])

# The turn is to his right (the stick's way off to his right); the foot that steps next is the
# outside one (his left: parity 0) or the inside one (his right: 1). A foot lands its own side of
# him, or a little across (a crossover): his left foot at x >= -CROSS, his right at x <= CROSS.
CROSS = 0.12

def solve(target):
    nS, nT = len(SGRID), len(TGRID)
    V = np.full((2, nS, nT), 50.0); pol = np.full((2, nS, nT), -1)
    ACT = [actions(s) for s in SGRID]
    def done(s, th):
        if target < 0.5: return s < 0.5
        return abs(s - target) <= max(0.4, 0.06 * target) and (th <= math.radians(7) or s < 0.5)
    for si, s in enumerate(SGRID):
        for ti, th in enumerate(TGRID):
            if done(s, th): V[:, si, ti] = 0.0
    for it in range(80):
        changed = 0.0
        for par in (0, 1):
          for si, s in enumerate(SGRID):
            A, C = ACT[si]
            ok = (A[:, 7] >= -CROSS) if par == 0 else (A[:, 7] <= CROSS)
            for ti, th in enumerate(TGRID):
                if done(s, th): continue
                # his velocity in the frame of the stick's way: angle th off it (to one side)
                # action dv is in his own frame (x: his left, z: ahead); the stick's way is off to
                # his right by th, say (th > 0 means he must turn right)
                if s < 0.3:
                    # (standing: he can face the stick's way first)
                    vx, vz = 0.0, max(s, 0.0)
                    nx, nz = A[:, 0], vz + A[:, 1]
                    ns = np.hypot(nx, nz); nth = np.abs(np.arctan2(nx, nz))
                else:
                    nx, nz = A[:, 0], s + A[:, 1]
                    ns = np.hypot(nx, nz)
                    # the new heading in his frame, then off the stick's way (which is at -th: to
                    # his right)
                    ang = np.arctan2(nx, nz)        # + to his left
                    nth = np.abs(((ang + th) + math.pi) % (2 * math.pi) - math.pi)
                si2 = np.clip(np.round(ns / 0.25).astype(int), 0, nS - 1)
                ti2 = np.clip(np.round(np.degrees(nth) / 5.0).astype(int), 0, nT - 1)
                # (and each metre carried off the line the stick points along costs DRIFT
                # seconds: he is to go that way from here, not somewhere round a wide arc)
                drift = 0.5 * (s * math.sin(min(th, math.pi / 2)) + ns * np.sin(np.minimum(nth, math.pi / 2))) * A[:, 2]
                back = 0.5 * (max(-s * math.cos(th), 0.0) + np.maximum(-ns * np.cos(nth), 0.0)) * A[:, 2]
                # (and swinging further off the stick's way costs: no weaving)
                away = np.maximum(nth - th, 0.0) * (ns > 0.5)
                tot = C + DRIFT * (drift + back) + 0.6 * away + V[1 - par, si2, ti2]
                tot = np.where(ok, tot, 1e9)
                k = int(np.argmin(tot))
                if tot[k] < V[par, si, ti] - 1e-6:
                    changed = max(changed, V[par, si, ti] - tot[k]); V[par, si, ti] = tot[k]; pol[par, si, ti] = k
        if changed < 1e-4: break
    return V, pol, ACT

if __name__ == '__main__':
    out = {}
    for target in (0.0, 3.5, 6.0, 9.5):
        V, pol, ACT = solve(target)
        out[target] = (V, pol, [a[0] for a in ACT])
        print('stick at', target)
        for s in (9.5, 7.0, 5.0, 3.0):
            si = int(round(s / 0.25))
            print('  from', s, ' '.join(f"{int(math.degrees(TGRID[ti])):3d}:{V[0, si, ti]:.2f}/{V[1, si, ti]:.2f}s" for ti in range(0, len(TGRID), 3)))
    pickle.dump(out, open('/tmp/chr/gen/policy.pkl', 'wb'))
