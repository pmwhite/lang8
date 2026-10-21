# What one step can do, from each way he might come down onto it: speed, height, and how fast he
# is falling as the foot lands. For each, steps sampled and searched (envelope.py's), kept with
# where each leaves him: the change of velocity, and his height and fall at the next landing.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import solver as S, envelope as E

SPEEDS = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.4]
YS = [0.80, 0.87, 0.94, 1.01]
VYS = [-1.0, -0.55, -0.1]

LO = np.array([-0.6, -0.45, 0.07, 0.0, 0.3, -0.9, 0.0])
HI = np.array([0.9, 0.45, 0.5, 0.25, 2.4, 0.9, 0.3])

def one(v, y0, vy0, x):
    ahead, aside, tc, tf, push, skew, tf_prev = x
    if tc + tf < 0.2 or tf_prev + tc + tf < 0.3: return None
    st = S.State((0.0, 0.0), (0.0, v), y0, vy0)
    s2, viol, eff = S.step_sim(st, np.array([aside, ahead]), tc, tf, tf_prev, y0, skew=skew, push=push)
    if not (0.74 < s2.y < 1.08) or s2.vy > 0.2: viol += 1.0
    dv = s2.v - np.array([0.0, v])
    return dv, viol, (dv[0], dv[1], tc + tf, eff, ahead, aside, tc, tf, skew, push, s2.y, s2.vy)

def gather(v, y0, vy0, rng, n_rand=1500, dirs=12, n=80, iters=4):
    rows = []
    for _ in range(n_rand):
        x = LO + rng.random(len(LO)) * (HI - LO)
        r = one(v, y0, vy0, x)
        if r and r[1] <= 0.002: rows.append(r[2])
    for k in range(dirs):
        phi = 2 * math.pi * k / dirs; u = np.array([math.sin(phi), math.cos(phi)])
        mu = (LO + HI) / 2; sig = (HI - LO) / 3
        for it in range(iters):
            X = np.clip(mu + rng.standard_normal((n, len(LO))) * sig, LO, HI)
            sc = np.full(n, -1e9)
            for i, x in enumerate(X):
                r = one(v, y0, vy0, x)
                if r is None: continue
                sc[i] = r[0] @ u - 50.0 * r[1]
                if r[1] <= 0.002: rows.append(r[2])
            top = np.argsort(-sc)[:n // 6]
            mu = X[top].mean(0); sig = X[top].std(0) + 1e-3
    return np.array(rows)

if __name__ == '__main__':
    rng = np.random.default_rng(2)
    env = {}
    for v in SPEEDS:
        for y0 in YS:
            for vy0 in VYS:
                env[(v, y0, vy0)] = gather(v, y0, vy0, rng)
        print(f"v {v}: " + " ".join(str(len(env[(v, y, w)])) for y in YS for w in VYS), flush=True)
    pickle.dump(env, open('/tmp/chr/gen/envelope2.pkl', 'wb'))
    print('done', flush=True)
