# The solved steps, run through the step physics from where he actually is each time a foot lands
# (as the game will): does he do what the stick says, within his limits, without drifting?
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import solver as S, dp

pol_all = pickle.load(open('/tmp/chr/gen/policy.pkl', 'rb'))
TARGETS = sorted(pol_all)

def look(target, par, s, th):
    V, pol, ACTS = pol_all[target]
    si = int(np.clip(round(s / 0.25), 0, len(dp.SGRID) - 1)); ti = int(np.clip(round(math.degrees(th) / 5), 0, len(dp.TGRID) - 1))
    a = pol[par, si, ti]
    if a < 0: return None
    return ACTS[si][a]

LO = np.array([-0.6, -0.45, 0.07, 0.0, 0.3, -0.9])
HI = np.array([0.9, 0.45, 0.5, 0.25, 2.4, 0.9])

def realize(st, h, side_sign, dv_want, y_want, tf_prev, rng, guess):
    # the step (foot ahead and to his side, contact, flight, push, its lean) that makes the
    # velocity change wanted from where he is, within his limits, landing near y_want
    mu = np.clip(np.array(guess, float), LO, HI); sig = (HI - LO) / 6
    best = None; bc = 1e18
    for it in range(8):
        X = np.clip(mu + rng.standard_normal((96, 6)) * sig, LO, HI); X[0] = mu
        C = np.zeros(len(X))
        for i, x in enumerate(X):
            ahead, aside, tc, tf, push, skew = x
            c = 0.0
            if tc + tf < 0.2 or tf_prev + tc + tf < 0.3: c += 100.0
            # (a foot its own side of him, or a little across)
            if aside * side_sign < -0.12: c += 100.0
            foot = st.p + S.unit(h) * ahead + S.left(h) * aside
            s2, viol, eff = S.step_sim(st, foot, tc, tf, tf_prev, st.y, None, skew=skew, push=push)
            dv = s2.v - st.v
            dvl = np.array([dv @ S.left(h), dv @ S.unit(h)])
            c += 4.0 * np.sum((dvl - dv_want) ** 2) + 1000.0 * viol + 60.0 * (s2.y - y_want) ** 2 + 0.0005 * eff
            # (landing too high or too low is out: he would bounce away or fold)
            c += 200.0 * max(s2.y - 1.08, 0.0) + 200.0 * max(0.72 - s2.y, 0.0)
            C[i] = c
        idx = np.argsort(C)[:8]
        if C[idx[0]] < bc: bc = C[idx[0]]; best = X[idx[0]].copy()
        mu = X[idx].mean(0); sig = X[idx].std(0) + 1e-3
    return best

def value(target, par, s, th):
    # the solved time to where the stick says, from speed s, th off its way, the next foot par
    V = pol_all[target][0]
    x = np.clip(s / 0.25, 0, V.shape[1] - 1.001); y = np.clip(math.degrees(th) / 5.0, 0, V.shape[2] - 1.001)
    i, j = int(x), int(y); u, w = x - i, y - j
    return (V[par, i, j] * (1 - u) * (1 - w) + V[par, i + 1, j] * u * (1 - w) + V[par, i, j + 1] * (1 - u) * w + V[par, i + 1, j + 1] * u * w)

def choose(st, want_h, target, side, tf_prev, rng, guess):
    # the step, from where he is, that leaves him best placed: its time and drift, and the solved
    # time onward from where it leaves him; within his limits, landing at a sound height
    h = S.heading(st.v, want_h)
    mu = np.clip(np.array(guess, float), LO, HI); sig = (HI - LO) / 5
    best = None; bc = 1e18
    for it in range(8):
        X = np.clip(mu + rng.standard_normal((96, 6)) * sig, LO, HI); X[0] = mu
        C = np.zeros(len(X))
        for i, x in enumerate(X):
            ahead, aside, tc, tf, push, skew = x
            c = 0.0
            if tc + tf < 0.2 or tf_prev + tc + tf < 0.3: c += 100.0
            if aside * (1 if side == 0 else -1) < -0.12: c += 100.0
            foot = st.p + S.unit(h) * ahead + S.left(h) * aside
            s2, viol, eff = S.step_sim(st, foot, tc, tf, tf_prev, st.y, None, skew=skew, push=push)
            sp = float(np.hypot(*s2.v)); h2 = S.heading(s2.v, want_h)
            turn = ((want_h - h2 + math.pi) % (2 * math.pi)) - math.pi
            th = abs(turn) if target > 0 else 0.0
            # (the next foot: outside or inside of what is left of the turn)
            outside = 0 if turn < 0 else 1
            par = 0 if (1 - side) == outside else 1
            dur = tc + tf
            sp0 = float(np.hypot(*st.v)); th0 = abs(((want_h - h + math.pi) % (2 * math.pi)) - math.pi) if target > 0 else 0.0
            drift = 0.5 * (sp0 * math.sin(min(th0, math.pi / 2)) + sp * math.sin(min(th, math.pi / 2))) * dur
            back = 0.5 * (max(-sp0 * math.cos(th0), 0) + max(-sp * math.cos(th), 0)) * dur
            if target == 0: drift = 0.5 * (sp0 + sp) * dur * 0.0
            c += dur + dp.DRIFT * (drift + back) + value(target, par, sp, th)
            c += dp.EFFORT * eff + 1000.0 * viol + 60.0 * (s2.y - S.height_at(sp)) ** 2 * 0.2
            c += 200.0 * max(s2.y - 1.08, 0.0) + 200.0 * max(0.72 - s2.y, 0.0)
            C[i] = c
        idx = np.argsort(C)[:10]
        if C[idx[0]] < bc: bc = C[idx[0]]; best = X[idx[0]].copy()
        mu = X[idx].mean(0); sig = X[idx].std(0) + 1e-3
    return best

def run(stick, seconds, v0=(0.0, 9.5)):
    v0 = np.array(v0, float)
    st = S.State((0, 0), v0, S.height_at(np.hypot(*v0)), -S.G * 0.06)
    side = 0; tf_prev = 0.12; steps = []; rec = []; rng = np.random.default_rng(0)
    while st.t < seconds:
        want_h, want_v = stick(st.t)
        target = min(TARGETS, key=lambda x: abs(x - want_v))
        speed = float(np.hypot(*st.v)); h = S.heading(st.v, want_h)
        turn = ((want_h - h + math.pi) % (2 * math.pi)) - math.pi    # + to his left
        if target == 0.0: turn = 0.0
        right = turn < 0
        th = abs(turn)
        # the outside of the turn: his left turning right
        outside = 0 if right else 1
        par = 0 if side == outside else 1
        A = look(target, par, speed, th)
        row = A
        if A is None:
            # (there: a steady step)
            utc, ust = S.usual(max(speed, 0.5))
            ahead, aside, tc, tf, push, skew = speed * utc / 2, 0.06 * (1 if side == 0 else -1), utc, ust - utc, 1.0, 0.0
        else:
            dvx, dvz, dur, eff, y0, habit, ahead, aside, tc, tf, skew, push, y1, vy1, vy0 = A
            if not right: aside = -aside        # (mirrored: the table turns to his right)
        x = choose(st, want_h, target, side, tf_prev, rng, [ahead, aside, tc, tf, push if row is not None else 1.0, skew if row is not None else 0.0])
        ahead, aside, tc, tf, push, skew = x
        foot = st.p + S.unit(h) * ahead + S.left(h) * aside
        s0 = st
        st, viol, eff = S.step_sim(st, foot, tc, tf, tf_prev, st.y, rec, skew=skew, push=push)
        steps.append(dict(t=s0.t, side=side, foot=foot, tc=tc, tf=tf, v_in=s0.v.copy(), v_out=st.v.copy(), p_td=s0.p.copy(), y=s0.y, viol=viol, par=par))
        tf_prev = tf; side = 1 - side
    return steps, rec

def report(steps):
    for s in steps:
        h = S.heading(s['v_in']); d = s['foot'] - s['p_td']
        print(f"  {'LR'[s['side']]}{'OI'[s['par']]} t {s['t']:.2f} contact {s['tc']:.2f} flight {s['tf']:.2f} v {np.hypot(*s['v_in']):4.1f}->{np.hypot(*s['v_out']):4.1f} "
              f"way {math.degrees(S.heading(s['v_in'])):+4.0f}->{math.degrees(S.heading(s['v_out'])):+4.0f} foot ahead {d @ S.unit(h):+.2f} left {d @ S.left(h):+.2f} y {s['y']:.2f} viol {s['viol']:.3f}")

if __name__ == '__main__':
    def script(parts):
        def f(t):
            for secs, deg, sp in parts:
                if t < secs: return (math.radians(deg), sp)
                t -= secs
            return (0.0, 0.0)
        return f
    cases = {'straight': [(3.0, 0, 9.5)], 'cut90': [(0.6, 0, 9.5), (2.4, -90, 9.5)], 'cut45': [(0.6, 0, 9.5), (2.0, -45, 9.5)],
             'turn180': [(0.6, 0, 9.5), (3.0, 180, 9.5)], 'stop': [(0.6, 0, 9.5), (2.0, 0, 0.0)]}
    for name in sys.argv[1:]:
        steps, rec = run(script(cases[name]), sum(p[0] for p in cases[name]))
        print(name); report(steps)
