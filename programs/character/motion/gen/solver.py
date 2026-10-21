# A runner as a point mass on feet: the solver chooses where each foot goes and how long it is down,
# a few steps ahead, to go where the stick says as soon as it can with as little effort as it can,
# within a human's limits. The physics:
#
#   on a foot: the ground pushes along the leg, from the foot to his centre of mass: up, a half
#              sine through the contact (as much as the step needs to come down level again), and
#              along the ground in proportion to how far he is from over the foot. So he cannot
#              push in a way that would topple him: balance is in the model.
#   in the air: he falls.
#
# Limits: the leg reaches only so far from his centre of mass; the push along the ground is at
# most MU of the push up (grip); the push up is at most F_MAX; the push ahead is at most so much
# power; a contact lasts at least TC_MIN; a foot in the air must have time to get to where it is
# put next (a swing of at least SWING_MIN, its speed limited).
import math, numpy as np

G = 9.81
MU = 1.0           # cleats on grass
F_MAX = 4.5 * G    # peak push up, per unit mass (sprinters' peaks 4-5 body weights)
POWER = 25.0       # most push power ahead, W/kg (sprint starts: 20-25)
REACH = 1.12       # centre of mass to the foot's middle of pressure, leg straight, on the toe
TC_MIN = 0.08
SWING_MIN = 0.25
DT = 1 / 120

def height_at(v):
    # his centre of mass's usual height running at speed v (lower the faster, a little)
    return 1.03 - 0.004 * min(v, 10.0)

class State:
    def __init__(s, p, v, y, vy, t=0.0):
        s.p = np.array(p, float); s.v = np.array(v, float); s.y = y; s.vy = vy; s.t = t

def shape(u, skew):
    # the push's shape over the contact: a half sine, leaning to the start (skew > 0: a braking
    # step, its peak as the foot strikes, the leg then yielding) or to the end (skew < 0: driving)
    return math.sin(math.pi * u) * (1.0 + skew * (1.0 - 2.0 * u))

def level_push(tc, tf, tf_prev):
    # the push up that carries him through a step and lands him as high as he began
    return G * math.pi * (tc + 0.5 * (tf + tf_prev)) / (2 * tc)

def landing_push(y0, vy0, tc, tf, skew, y_want):
    # the push up (its peak) that lands him at y_want after the contact and the flight: his height
    # then is linear in it
    def end(A):
        y, vy = y0, vy0
        n = max(int(round(tc / DT)), 1); h = tc / n
        for i in range(n):
            u = (i + 0.5) / n
            vy += (A * shape(u, skew) - G) * h; y += vy * h
        return y + vy * tf - G * tf * tf / 2
    e0 = end(0.0); e1 = end(10.0)
    return max((y_want - e0) / max((e1 - e0) / 10.0, 1e-6), 0.0)

def step_sim(st, foot, tc, tf, tf_prev, level, record=None, skew=0.0, push=None):
    """One step: the foot down at `foot` (2D) for tc, then flight tf. Returns the state as the next
    foot lands, and the step's violations (how far over each limit) and effort. `push`: how much
    harder (or softer) than a level step's he pushes up, free; else toward `level`."""
    p = st.p.copy(); v = st.v.copy(); y = st.y; vy = st.vy
    if push is not None:
        A = level_push(tc, tf, tf_prev) * push
    else:
        A = G * math.pi * (tc + 0.5 * (tf + tf_prev)) / (2 * tc)
        A += (level - y) * 4.0 * math.pi / (2 * tc) / max(tc, 0.05) * 0.5
    A = max(A, 0.0)
    viol = 0.0; effort = 0.0; work_ahead = 0.0
    n = max(int(round(tc / DT)), 1); h = tc / n
    for i in range(n):
        u = (i + 0.5) / n
        fv = A * shape(u, skew)
        d = p - foot; height = max(y, 0.3)
        ah = fv * d / height
        # limits: reach, grip
        dist = math.sqrt(d @ d + height * height)
        viol += max(dist - REACH, 0.0) * 4.0 * h / tc
        ratio = math.sqrt(d @ d) / height
        viol += max(ratio - MU, 0.0) * fv / G * h
        effort += (ah @ ah) * h + 0.02 * fv * fv / G * h
        v = v + ah * h; p = p + v * h
        vy = vy + (fv - G) * h; y = y + vy * h
        if record is not None: record.append((st.t + (i + 1) * h, p.copy(), v.copy(), y, foot, True))
    viol += max(A - F_MAX, 0.0) / G
    # speeding up: the step adds no more speed than his legs can (hardest from slow, none at his
    # top speed: 9.5 m/s2 x (1 - v / 10.4), some 25 W/kg at its most)
    s0 = math.hypot(*st.v); s1 = math.hypot(*v)
    most = 9.5 * max(1 - s0 / 10.4, 0.0) * (tc + tf) + 0.05
    viol += max(s1 - s0 - most, 0.0)
    # the flight
    m = max(int(round(tf / DT)), 0)
    for i in range(m):
        p = p + v * DT; vy = vy - G * DT; y = y + vy * DT
        if record is not None: record.append((st.t + tc + (i + 1) * DT, p.copy(), v.copy(), y, foot, False))
    out = State(p, v, y, vy, st.t + tc + tf)
    return out, viol, effort

def heading(v, or_h=0.0):
    return math.atan2(v[0], v[1]) if np.hypot(*v) > 0.05 else or_h
def unit(h): return np.array([math.sin(h), math.cos(h)])
def left(h): return np.array([math.cos(h), -math.sin(h)])

# A plan: K steps, each (ahead, aside, tc, tf, drop) where ahead/aside place the foot from his
# centre of mass at the moment it lands, in the frame of his heading then.
K = 3
NPAR = 5

def rollout(st, params, sides, feet_prev, tf_prev, want, record=None):
    """Simulate K steps; return cost. feet_prev: where each foot (0 left, 1 right) last left the
    ground and when."""
    cost = 0.0; s = st; tfp = tf_prev; fp = {k: v for k, v in feet_prev.items()}
    want_v = want[1]; want_d = unit(want[0]) if want_v > 0 else None
    for k in range(K):
        ahead, aside, tc, tf, drop = params[k]
        h = heading(s.v, want[0])
        side = sides[k]
        foot = s.p + unit(h) * ahead + left(h) * aside * (1 if side == 0 else -1)
        level = height_at(np.hypot(*s.v)) - drop
        # the foot's swing: from where it last left, in time
        f_from, t_left = fp[side]
        swing = s.t - t_left
        dist = np.hypot(*(foot - f_from))
        sv = 2.4 * max(np.hypot(*s.v), 3.0) + 2.0
        viol = max(SWING_MIN - swing, 0.0) * 10.0 + max(dist - sv * max(swing, 0.01), 0.0) * 2.0
        # a foot stays its side of him (a little across allowed: a crossover)
        viol += max(-aside - 0.12, 0.0) * 5.0
        viol += max(TC_MIN - tc, 0.0) * 20.0 + max(-tf, 0.0) * 20.0
        s2, v2, eff = step_sim(s, foot, tc, max(tf, 0.0), tfp, level, record)
        viol += v2
        # how far from what the stick wants, over the step (time spent off it costs)
        dur = tc + max(tf, 0.0)
        if want_d is not None:
            vt = want_d * want_v
            err = np.hypot(*(s2.v - vt))
            # (off the way he should go counts more than off the speed)
            cost += 10.0 * (err * err) * dur * (1.0 + 0.3 * k)
        else:
            cost += 10.0 * (s2.v @ s2.v) * dur
        cost += 0.002 * eff + 1000.0 * viol + 4.0 * drop * drop + 2.0 * (aside - 0.06) ** 2
        # (his habit: a runner's usual contact and step time, unless the move asks otherwise)
        utc, ust = usual(np.hypot(*s.v))
        cost += 0.4 * ((tc - utc) / utc) ** 2 + 0.4 * ((tc + max(tf, 0.0) - ust) / ust) ** 2
        # (hold his height near its usual)
        cost += 5.0 * (s2.y - height_at(np.hypot(*s2.v))) ** 2
        fp[side] = (foot, s.t + tc)
        tfp = max(tf, 0.0); s = s2
    return cost

def usual(sp):
    # the measured runners' contact and step time at speed sp (the run cycles)
    sp = max(sp, 0.5)
    tc = float(np.interp(sp, [1.5, 3.5, 6.0, 9.5], [0.32, 0.24, 0.15, 0.09]))
    st = float(np.interp(sp, [1.5, 3.5, 6.0, 9.5], [0.44, 0.37, 0.29, 0.22]))
    return tc, st

def nominal(v, sides):
    # a steady step at speed v: the foot under him at mid-contact
    sp = max(np.hypot(*v), 0.5)
    tc = float(np.interp(sp, [1.5, 3.5, 6.0, 9.5], [0.32, 0.24, 0.15, 0.09]))
    st = float(np.interp(sp, [1.5, 3.5, 6.0, 9.5], [0.44, 0.37, 0.29, 0.22]))
    return np.array([[sp * tc * 0.5, 0.05, tc, st - tc, 0.0] for _ in sides])

LO = np.array([-0.6, -0.15, 0.07, 0.0, 0.0])
HI = np.array([0.9, 0.7, 0.6, 0.2, 0.3])

def solve(st, sides, feet_prev, tf_prev, want, mean=None, iters=6, n=160, rng=None):
    """Cross-entropy search for the next K steps."""
    rng = rng or np.random.default_rng(0)
    mu = nominal(st.v, sides) if mean is None else mean.copy()
    sig = np.tile(np.array([0.25, 0.12, 0.06, 0.05, 0.06]), (K, 1))
    best = None; best_c = 1e18
    for it in range(iters):
        X = mu[None] + rng.standard_normal((n, K, NPAR)) * sig[None]
        X = np.clip(X, LO, HI)
        X[0] = mu
        C = np.array([rollout(st, x, sides, feet_prev, tf_prev, want) for x in X])
        idx = np.argsort(C)[:n // 8]
        if C[idx[0]] < best_c: best_c = C[idx[0]]; best = X[idx[0]].copy()
        mu = X[idx].mean(0); sig = X[idx].std(0) + 1e-3
    return best, best_c

def run(stick, seconds, v0=(0.0, 9.5), seed=0):
    """Steer by stick(t) -> (heading, speed) for some seconds; the steps taken and his path."""
    rng = np.random.default_rng(seed)
    v0 = np.array(v0, float)
    st = State((0, 0), v0, height_at(np.hypot(*v0)), 0.0)
    side = 0
    feet_prev = {0: (np.array([0.0, -0.4]), -0.15), 1: (np.array([0.0, -0.9]), -0.25)}
    tf_prev = 0.1; steps = []; rec = []; mean = None
    while st.t < seconds:
        want = stick(st.t)
        sides = [(side + k) % 2 for k in range(K)]
        best, c = solve(st, sides, feet_prev, tf_prev, want, mean, rng=rng)
        ahead, aside, tc, tf, drop = best[0]
        h = heading(st.v, want[0])
        foot = st.p + unit(h) * ahead + left(h) * aside * (1 if side == 0 else -1)
        level = height_at(np.hypot(*st.v)) - drop
        s0 = st
        st, viol, eff = step_sim(st, foot, tc, max(tf, 0.0), tf_prev, level, rec)
        steps.append(dict(t=s0.t, side=side, foot=foot, tc=tc, tf=max(tf, 0.0), v_in=s0.v.copy(), v_out=st.v.copy(),
                          p_td=s0.p.copy(), drop=drop, viol=viol, y_td=s0.y))
        feet_prev[side] = (foot, s0.t + tc)
        tf_prev = max(tf, 0.0); side = 1 - side
        # (warm start: the rest of the plan, and a steady step after)
        mean = np.vstack([best[1:], best[-1:]])
    return steps, rec

def report(steps):
    for s in steps:
        h = heading(s['v_in']); d = s['foot'] - s['p_td']
        print(f"  {'LR'[s['side']]} t {s['t']:.2f} contact {s['tc']:.2f} flight {s['tf']:.2f} v {np.hypot(*s['v_in']):.1f}->{np.hypot(*s['v_out']):.1f} "
              f"way {math.degrees(heading(s['v_in'])):+4.0f}->{math.degrees(heading(s['v_out'])):+4.0f} foot ahead {d @ unit(h):+.2f} out {d @ left(h) * (1 if s['side']==0 else -1):+.2f} "
              f"drop {s['drop']:.2f} y {s['y_td']:.2f} viol {s['viol']:.3f}")

if __name__ == '__main__':
    import sys
    def script(parts):
        def f(t):
            for secs, deg, sp in parts:
                if t < secs: return (math.radians(deg), sp)
                t -= secs
            return (0.0, 0.0)
        return f
    cases = {'straight': ([(3.0, 0, 9.5)], (0, 9.5)),
             'cut90': ([(0.5, 0, 9.5), (2.5, -90, 9.5)], (0, 9.5)),
             'cut45': ([(0.5, 0, 9.5), (2.0, -45, 9.5)], (0, 9.5)),
             'turn180': ([(0.5, 0, 9.5), (3.0, 180, 9.5)], (0, 9.5)),
             'start': ([(3.0, 0, 9.5)], (0, 0.01))}
    for name in sys.argv[1:]:
        parts, v0 = cases[name]
        steps, rec = run(script(parts), sum(p[0] for p in parts), v0)
        print(name); report(steps)
