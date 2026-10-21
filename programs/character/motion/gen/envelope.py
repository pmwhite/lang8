# What one step can do: at each speed, sample where the foot goes and how long it is down, simulate
# the step (solver.step_sim: the push along the leg, gravity, his limits), and keep those within his
# limits: the change of velocity each makes, how long it takes, and its effort.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import solver as S

SPEEDS = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.4]

def one_step(v, y0, vy0, ahead, aside, tc, tf, push, skew, tf_prev):
    st = S.State((0.0, 0.0), (0.0, v), y0, vy0)
    foot = np.array([aside, ahead])
    return S.step_sim(st, foot, tc, tf, tf_prev, y0, skew=skew, push=push)

def sample(v, n, rng):
    utc, ust = S.usual(max(v, 0.5))
    out = []
    for _ in range(n):
        ahead = rng.uniform(-0.6, 0.9)
        aside = rng.uniform(-0.45, 0.45)
        tc = rng.uniform(0.07, 0.5)
        tf = rng.uniform(0.0, 0.25)
        push = rng.uniform(0.5, 2.2)
        skew = rng.uniform(-0.9, 0.9)
        # coming in: as high as usual or sunk lower, falling as a flight brings him down
        y0 = rng.uniform(S.height_at(v) - 0.25, S.height_at(v))
        tf_prev = rng.uniform(0.0, max(ust - utc, 0.02))
        vy0 = -S.G * tf_prev / 2 - rng.uniform(0.0, 0.6)
        # (a step takes at least 0.2 s: some five a second at most, the other leg swinging
        # through, which takes some 0.3 s; and a foot goes no further out to his side than his
        # hip lets it: some 0.45 m, the widest side-steps measured)
        if tc + tf < 0.2 or tf_prev + tc + tf < 0.3 or abs(aside) > 0.45: continue
        s2, viol, eff = one_step(v, y0, vy0, ahead, aside, tc, tf, push, skew, tf_prev)
        if viol > 0.002: continue
        if not (0.7 < s2.y < 1.15): continue
        dv = s2.v - np.array([0.0, v])
        habit = 0.4 * ((tc - utc) / utc) ** 2 + 0.4 * ((tc + tf - ust) / ust) ** 2
        out.append((dv[0], dv[1], tc + tf, eff, y0, habit, ahead, aside, tc, tf, skew, push, s2.y, s2.vy, vy0))
    return np.array(out)

LO = np.array([-0.6, -0.45, 0.07, 0.0, 0.5, -0.9, -0.25, 0.0, 0.0])
HI = np.array([0.9, 0.45, 0.5, 0.25, 2.2, 0.9, 0.0, 0.6, 0.3])

def run_params(v, x):
    # x: ahead, aside, tc, tf, push, skew, sink (incoming height below usual), extra fall, tf_prev
    utc, ust = S.usual(max(v, 0.5))
    ahead, aside, tc, tf, push, skew, sink, fall, tf_prev = x
    if tc + tf < 0.2 or tf_prev + tc + tf < 0.3: return None
    y0 = S.height_at(v) + sink
    vy0 = -S.G * tf_prev / 2 - fall
    s2, viol, eff = one_step(v, y0, vy0, ahead, aside, tc, tf, push, skew, tf_prev)
    if not (0.7 < s2.y < 1.15): viol += 1.0
    dv = s2.v - np.array([0.0, v])
    habit = 0.4 * ((tc - utc) / utc) ** 2 + 0.4 * ((tc + tf - ust) / ust) ** 2
    return dv, viol, (dv[0], dv[1], tc + tf, eff, y0, habit, ahead, aside, tc, tf, skew, push, s2.y, s2.vy, vy0)

def extremes(v, rng, dirs=24, n=150, iters=6):
    # for each way the velocity might be changed, as far as one step can change it
    found = []
    for k in range(dirs):
        phi = 2 * math.pi * k / dirs; u = np.array([math.sin(phi), math.cos(phi)])
        mu = (LO + HI) / 2; sig = (HI - LO) / 3
        for it in range(iters):
            X = np.clip(mu + rng.standard_normal((n, len(LO))) * sig, LO, HI)
            sc = np.full(n, -1e9)
            for i, x in enumerate(X):
                r = run_params(v, x)
                if r is None: continue
                dv, viol, row = r
                sc[i] = dv @ u - 50.0 * viol
                if viol <= 0.002: found.append(row)
            top = np.argsort(-sc)[:n // 6]
            mu = X[top].mean(0); sig = X[top].std(0) + 1e-3
    return found

if __name__ == '__main__':
    rng = np.random.default_rng(1)
    env = {}
    for v in SPEEDS:
        A = sample(v, int(sys.argv[1]) if len(sys.argv) > 1 else 20000, rng)
        E = np.array(extremes(v, rng))
        A = np.vstack([A, E]) if len(A) and len(E) else (A if len(A) else E)
        env[v] = A
        if len(A):
            back = A[:, 1].min(); fwd = A[:, 1].max(); side = np.abs(A[:, 0]).max()
            print(f"v {v:4.1f}: {len(A):5d} steps within limits; speed change {back:+.1f}..{fwd:+.1f} m/s, sideways up to {side:.1f}")
        else: print(f"v {v}: none")
    pickle.dump(env, open('/tmp/chr/gen/envelope.pkl', 'wb'))
