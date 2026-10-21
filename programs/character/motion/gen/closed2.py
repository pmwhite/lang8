# The solved steps (dp2.py), run through the step physics from where he really is each landing.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import solver as S
from envelope2 import SPEEDS, YS, VYS
import dp2

pol_all = pickle.load(open('/tmp/chr/gen/policy2.pkl', 'rb'))
TARGETS = sorted(pol_all)

def pick(target, par, s, th, y, vy):
    V, pol, ACT = pol_all[target]
    si = int(dp2.nearest(dp2.SP, [s])[0]); yi = int(dp2.nearest(dp2.YA, [y])[0]); wi = int(dp2.nearest(dp2.VA, [vy])[0])
    ti = int(np.clip(round(math.degrees(th) / 5), 0, len(dp2.TGRID) - 1))
    a = pol[par, si, ti, yi, wi]
    if a < 0 or ACT[(si, yi, wi)] is None: return None
    return ACT[(si, yi, wi)][a]

LO = np.array([-0.6, -0.45, 0.07, 0.0, 0.3, -0.9])
HI = np.array([0.9, 0.45, 0.5, 0.25, 2.4, 0.9])

def realize(st, h, side_sign, want, tf_prev, rng, guess):
    # the step from where he is that comes out as the planned one does: its change of velocity,
    # and his height and fall as the next foot lands
    dv_want, y_want, vy_want = want
    mu = np.clip(np.array(guess, float), LO, HI); sig = (HI - LO) / 8
    best = None; bc = 1e18
    for it in range(6):
        X = np.clip(mu + rng.standard_normal((64, 6)) * sig, LO, HI); X[0] = mu
        C = np.zeros(len(X))
        for i, x in enumerate(X):
            ahead, aside, tc, tf, push, skew = x
            c = 0.0
            if tc + tf < 0.2 or tf_prev + tc + tf < 0.3: c += 100.0
            if aside * side_sign < -0.12: c += 100.0
            foot = st.p + S.unit(h) * ahead + S.left(h) * aside
            s2, viol, eff = S.step_sim(st, foot, tc, tf, tf_prev, st.y, None, skew=skew, push=push)
            dv = s2.v - st.v; dvl = np.array([dv @ S.left(h), dv @ S.unit(h)])
            c += 4.0 * np.sum((dvl - dv_want) ** 2) + 60.0 * (s2.y - y_want) ** 2 + 4.0 * (s2.vy - vy_want) ** 2 + 1000.0 * viol
            C[i] = c
        idx = np.argsort(C)[:8]
        if C[idx[0]] < bc: bc = C[idx[0]]; best = X[idx[0]].copy()
        mu = X[idx].mean(0); sig = X[idx].std(0) + 1e-3
    return best

def value(target, par, s, th, y, vy):
    V = pol_all[target][0]
    si = np.interp(s, dp2.SP, np.arange(len(dp2.SP))); ti = min(math.degrees(th) / 5.0, len(dp2.TGRID) - 1.001)
    yi = np.interp(y, dp2.YA, np.arange(len(dp2.YA))); wi = np.interp(vy, dp2.VA, np.arange(len(dp2.VA)))
    tot = 0.0
    for a, wa in ((int(si), 1 - (si - int(si))), (min(int(si) + 1, len(dp2.SP) - 1), si - int(si))):
        for b, wb in ((int(ti), 1 - (ti - int(ti))), (min(int(ti) + 1, len(dp2.TGRID) - 1), ti - int(ti))):
            for c, wc in ((int(yi), 1 - (yi - int(yi))), (min(int(yi) + 1, len(dp2.YA) - 1), yi - int(yi))):
                for d, wd in ((int(wi), 1 - (wi - int(wi))), (min(int(wi) + 1, len(dp2.VA) - 1), wi - int(wi))):
                    tot += wa * wb * wc * wd * min(V[par, a, b, c, d], 60.0)
    return tot

def choose(st, want_h, target, side, tf_prev, rng, guess, h):
    mu = np.clip(np.array(guess, float), LO, HI); sig = (HI - LO) / 6
    best = None; bc = 1e18
    sp0 = float(np.hypot(*st.v)); th0 = abs(((want_h - h + math.pi) % (2 * math.pi)) - math.pi) if target > 0 else 0.0
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
            if not (0.74 < s2.y < 1.08) or s2.vy > 0.2 or s2.vy < -1.2: c += 50.0
            sp = float(np.hypot(*s2.v)); h2 = S.heading(s2.v, want_h)
            turn = ((want_h - h2 + math.pi) % (2 * math.pi)) - math.pi
            th = abs(turn) if target > 0 else 0.0
            par = 0 if (1 - side) == (0 if turn < 0 else 1) else 1
            dur = tc + tf
            drift = 0.5 * (sp0 * math.sin(min(th0, math.pi / 2)) + sp * math.sin(min(th, math.pi / 2))) * dur
            back = 0.5 * (max(-sp0 * math.cos(th0), 0) + max(-sp * math.cos(th), 0)) * dur
            if target == 0: drift = back = 0.0
            away = max(th - th0, 0.0) * (sp > 0.5)
            low = max(S.height_at(sp) - s2.y, 0.0)
            c += dur + dp2.EFFORT * eff + dp2.DRIFT * (drift + back) + 0.6 * away + value(target, par, sp, th, s2.y, s2.vy) + dp2.LOW * low * low * dur * 10.0 + 1000.0 * viol
            C[i] = c
        idx = np.argsort(C)[:10]
        if C[idx[0]] < bc: bc = C[idx[0]]; best = X[idx[0]].copy()
        mu = X[idx].mean(0); sig = X[idx].std(0) + 1e-3
    return best

MODE = 'table'

def run(stick, seconds, v0=(0.0, 9.5)):
    v0 = np.array(v0, float)
    st = S.State((0, 0), v0, 0.99, -S.G * 0.06)
    side = 0; tf_prev = 0.13; steps = []; rec = []; rng = np.random.default_rng(0)
    while st.t < seconds:
        want_h, want_v = stick(st.t)
        target = min(TARGETS, key=lambda x: abs(x - want_v))
        speed = float(np.hypot(*st.v)); h = S.heading(st.v, want_h)
        turn = ((want_h - h + math.pi) % (2 * math.pi)) - math.pi
        if target == 0.0 or speed < 0.3: turn = 0.0 if target == 0.0 else turn
        right = turn < 0; th = abs(turn)
        outside = 0 if right else 1
        par = 0 if side == outside else 1
        if speed < 0.3 and target > 0: h = want_h; th = 0.0
        A = pick(target, par, speed, th, st.y, st.vy)
        if A is None:
            utc, ust = S.usual(max(speed, 0.5))
            ahead, aside, tc, tf, skew, push = speed * utc / 2, 0.06 * (1 if side == 0 else -1), utc, ust - utc, 0.0, 1.0
        else:
            dvx, dvz, dur, eff, ahead, aside, tc, tf, skew, push, y1, vy1 = A
            if not right: aside = -aside; dvx = -dvx
            if MODE == 'table':
                x = realize(st, h, 1 if side == 0 else -1, (np.array([dvx, dvz]), y1, vy1), tf_prev, rng, [ahead, aside, tc, tf, push, skew])
            else:
                utc, ust = S.usual(max(speed, 0.5))
                x = choose(st, want_h, target, side, tf_prev, rng, [speed * utc / 2, 0.06 * (1 if side == 0 else -1), utc, ust - utc, 1.0, 0.0], h)
            ahead, aside, tc, tf, push, skew = x
        foot = st.p + S.unit(h) * ahead + S.left(h) * aside
        s0 = st
        st, viol, eff = S.step_sim(st, foot, tc, tf, tf_prev, st.y, rec, skew=skew, push=push)
        steps.append(dict(t=s0.t, side=side, foot=foot, tc=tc, tf=tf, v_in=s0.v.copy(), v_out=st.v.copy(), p_td=s0.p.copy(), y=s0.y, vy=s0.vy, viol=viol, par=par, push=push))
        tf_prev = tf; side = 1 - side
    return steps, rec

def report(steps):
    for s in steps:
        h = S.heading(s['v_in']); d = s['foot'] - s['p_td']
        print(f"  {'LR'[s['side']]}{'OI'[s['par']]} t {s['t']:.2f} c {s['tc']:.2f} f {s['tf']:.2f} v {np.hypot(*s['v_in']):4.1f}->{np.hypot(*s['v_out']):4.1f} "
              f"way {math.degrees(S.heading(s['v_in'])):+4.0f}->{math.degrees(S.heading(s['v_out'])):+4.0f} foot ahead {d @ S.unit(h):+.2f} left {d @ S.left(h):+.2f} y {s['y']:.2f} vy {s['vy']:+.2f} push {s['push']:.1f} viol {s['viol']:.3f}")

if __name__ == '__main__':
    def script(parts):
        def f(t):
            for secs, deg, sp in parts:
                if t < secs: return (math.radians(deg), sp)
                t -= secs
            return (0.0, 0.0)
        return f
    cases = {'straight': [(3.0, 0, 9.5)], 'cut90': [(0.6, 0, 9.5), (2.4, -90, 9.5)], 'cut45': [(0.6, 0, 9.5), (2.0, -45, 9.5)],
             'turn180': [(0.6, 0, 9.5), (3.0, 180, 9.5)], 'stop': [(0.6, 0, 9.5), (2.0, 0, 0.0)], 'start': [(3.0, 0, 9.5)]}
    if sys.argv[1] == 'value': MODE = 'value'; sys.argv = sys.argv[1:]
    for name in sys.argv[1:]:
        v0 = (0.0, 0.01) if name == 'start' else (0.0, 9.5)
        steps, rec = run(script(cases[name]), sum(p[0] for p in cases[name]), v0)
        print(name); report(steps)
