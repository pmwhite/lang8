# Footsteps for a runner the stick steers: the same model the viewer will run.
#
# He is a point over the ground (his hips), and his feet. Each step is a foot down for a while
# (its contact), pushing him, then a flight. A push changes his velocity over the contact; how it
# is changed, and how long the foot is down, depends on what the step is for:
#
#   run    steady, or speeding up, or slowing gently; bending his way no more than his grip holds
#          (an arc)
#   brake  slowing hard, the foot well ahead
#   pen    the penultimate step of a cut or turn: the last braking, on the foot on the side he
#          will go
#   plant  the cut itself, on the outside foot: his way swung round
#   cross  a crossover: the inside foot planted, turning him partway, the other leg to cross over
#   pivot  a turn right round, on the outside foot: stopped and sent back
#   push   the first step off a plant or pivot, speeding up
#   stop   the last steps of stopping, and standing
#
# The numbers are from the literature (see programs/character/motion/README.md); where a foot
# lands follows from the push it must make (the force along the leg, from foot to hips).
import math, numpy as np

G = 9.81
# Run timing at a speed: (speed, step time, contact) from the run cycles (synth.py)
RUN = [(1.5, 0.439, 0.321), (2.5, 0.387, 0.283), (3.5, 0.369, 0.237), (4.5, 0.343, 0.205),
       (6.0, 0.293, 0.148), (7.5, 0.255, 0.114), (9.5, 0.218, 0.086), (10.4, 0.212, 0.082)]
def run_timing(v):
    xs = [r[0] for r in RUN]
    return float(np.interp(v, xs, [r[1] for r in RUN])), float(np.interp(v, xs, [r[2] for r in RUN]))
TOP = 10.4
def burst(v):
    # speeding up: hardest from standing (m/s2)
    return 9.5 * max(1 - v / TOP, 0.0)
BRAKE = 6.0          # hard braking, averaged over a step (Harper et al. 2022: -5.7 to -6.3)
EASE = 3.0           # slowing gently
def grip(v):
    # the most he can push sideways running an arc, m/s2: about 0.9 g on tight curves at 3 m/s,
    # 0.4 g at 8 m/s (Chang and Kram 2007; Diaz et al. 2024)
    return min(max(11.5 - 0.95 * v, 3.5), 9.0)
ARC_MOST = 30.0      # degrees: up to here an arc
CROSS_MOST = 55.0    # up to here a cut can be one step (crossover or side step)
CUT_MOST = 130.0     # up to here a side-step cut; beyond, a turn right round
def lerp_deg(deg, pts):
    return float(np.interp(deg, [p[0] for p in pts], [p[1] for p in pts]))
# The angle-velocity trade-off: the speed he can carry into the plant (Dos'Santos et al. 2018,
# 2021: 3.45 m/s at the plant of a 90-degree cut from 4.6; 45-degree cuts done from about 4.7 with
# hardly any braking), set somewhat higher for a running back
def plant_speed(deg): return lerp_deg(deg, [(30, 8.0), (45, 6.5), (60, 5.2), (90, 3.9), (130, 2.8)])
def plant_keep(deg): return lerp_deg(deg, [(30, 0.97), (45, 0.95), (90, 0.92), (130, 0.85)])
def plant_contact(deg): return lerp_deg(deg, [(30, 0.14), (45, 0.16), (60, 0.22), (90, 0.28), (130, 0.34)])
PEN_CONTACT = 0.2    # Dos'Santos et al. 2021
PIVOT_IN = 2.2       # speed into a turn right round (approaches of 3.4, braked over 3-6 steps)
PIVOT_CONTACT = 0.48  # 0.44-0.52 s
PIVOT_PEN = 0.38
PUSH_CONTACT = 0.2
# The most a foot pushes along the ground, as a share of what holds him up over its step
MU = 0.7

def rot(v, a):
    c, s = math.cos(a), math.sin(a)
    return np.array([v[0] * c + v[1] * s, -v[0] * s + v[1] * c])
def ang(a, b):
    # signed angle from a to b, + to the left (x is his left at heading 0, z ahead)
    return math.atan2(a[1] * b[0] - a[0] * b[1], a[0] * b[0] + a[1] * b[1])
def heading_of(v, or_h=0.0):
    return math.atan2(v[0], v[1]) if np.hypot(*v) > 0.05 else or_h
def unit(h): return np.array([math.sin(h), math.cos(h)])
def left_of(h): return np.array([math.cos(h), -math.sin(h)])

class Step:
    def __init__(s, **k): s.__dict__.update(k)
    def __repr__(s):
        return (f"{s.kind:5s} {s.side} t {s.t:.2f} contact {s.tc:.2f} flight {s.tf:.2f} v {np.hypot(*s.v_in):.1f}->{np.hypot(*s.v_out):.1f} "
                f"way {math.degrees(heading_of(s.v_in)):+.0f}->{math.degrees(heading_of(s.v_out)):+.0f}")

def brake_rate(v):
    # how hard he can slow, m/s2: gently at speed, hardest once slow (Harper et al. 2022: -3.9
    # early in stopping from a sprint, -6.0 late, peaks of -8.5)
    return float(np.interp(v, [3.0, 5.0, 8.0], [7.0, 5.5, 3.5]))

def plan(stick, seconds, v0=(0.0, 0.0), start_side='L'):
    """stick(t) -> (heading radians or None, speed). The steps he takes."""
    t = 0.0; p = np.zeros(2); v = np.array(v0, float); side = start_side
    steps = []; face = heading_of(v); since_cut = 9
    # what he is in the middle of: None (running), 'cut', 'turn' (right round), or 'stop'; for a
    # cut or turn its way out and the speed he means to plant at; and what the last step was
    mode = None; goal = 0.0; target = 0.0; last = 'run'
    while t < seconds:
        want_h, want_v = stick(t)
        speed = float(np.hypot(*v)); h = heading_of(v, face)
        Tr, tcr = run_timing(max(speed, 1.5))
        moving = speed > 0.5
        if want_h is None or want_v < 0.2:
            mode = 'stop' if moving else None
            kind = 'stop' if moving else ('stand' if speed < 0.05 else 'stop')
        else:
            turn = ang(unit(h), unit(want_h)) if moving else 0.0
            deg = abs(math.degrees(turn))
            if mode == 'stop': mode = None
            if mode in ('cut', 'turn'):
                # (still wanted? the stick back near straight ahead calls it off)
                if deg <= ARC_MOST: mode = None
                else: goal = want_h
            if mode is None and moving and deg > ARC_MOST and not (deg <= CROSS_MOST and since_cut < 3):
                if deg <= CROSS_MOST and speed <= plant_speed(deg) * 1.1:
                    mode = 'one'
                elif deg <= CUT_MOST:
                    mode, target = 'cut', plant_speed(deg)
                else:
                    mode, target = 'turn', PIVOT_IN
                goal = want_h
            inside = 'L' if ang(unit(h), unit(goal if mode else want_h)) > 0 else 'R'
            if not moving:
                kind = 'start'
            elif mode is None:
                kind = 'run'
            elif mode == 'one':
                # one step: on the outside foot a side step, on the inside foot a crossover
                kind = 'cross' if side == inside else 'plant'
            elif last in ('pen', 'ppen') and side != inside:
                kind = 'plant' if mode == 'cut' else 'pivot'
            elif side == inside and speed - brake_rate(speed) * 1.6 * (PEN_CONTACT + 0.06) <= target * 1.05:
                kind = 'pen' if mode == 'cut' else 'ppen'
            elif speed <= target * 1.05:
                # (slow enough already: a plain step, to bring the inside foot round)
                kind = 'run'
            else:
                kind = 'brake'
        # what the step does
        tc, tf = tcr, Tr - tcr; v_out = v.copy(); drop = 0.0
        g = goal if mode else want_h
        if kind == 'run':
            to = min(want_v, TOP)
            ns = min(to, speed + burst(speed) * Tr) if to > speed else max(to, speed - EASE * Tr)
            # (timed as a step at its average speed: speeding up, each step is quicker than the last)
            Tr, tcr = run_timing(max((speed + ns) / 2, 1.5)); tc, tf = tcr, Tr - tcr
            ns = min(to, speed + burst(speed) * Tr) if to > speed else max(to, speed - EASE * Tr)
            most = grip(speed) * Tr / max(speed, 1.0)
            tn = ang(unit(h), unit(g)) if g is not None else 0.0
            v_out = unit(h + max(-most, min(most, tn))) * ns
        elif kind == 'start':
            tc, tf = 0.24, 0.04
            v_out = unit(g) * min(want_v, 2.2)
        elif kind == 'brake':
            tc = tcr * 1.3; tf = max(Tr - tc, 0.05)
            ns = min(speed, max(target if mode in ('cut', 'turn') else 0.0, speed - brake_rate(speed) * (tc + tf)))
            v_out = unit(h) * ns; drop = 0.04
        elif kind in ('pen', 'ppen'):
            tc = PEN_CONTACT if kind == 'pen' else PIVOT_PEN; tf = 0.06
            ns = min(speed, max(target, speed - brake_rate(speed) * 1.6 * (tc + tf)))
            if kind == 'ppen': ns = min(speed, max(target * 0.7, speed - brake_rate(speed) * 1.6 * (tc + tf)))
            v_out = unit(h) * ns; drop = 0.07 if kind == 'pen' else 0.15
        elif kind in ('plant', 'cross'):
            tn = ang(unit(h), unit(g)); deg = abs(math.degrees(tn))
            # (longer the slower he comes in: 0.35-0.45 s in the slow V-cuts of Nitschke et al.)
            tc = max(plant_contact(deg), tcr * 1.25); tf = 0.07
            if kind == 'cross':
                # a crossover turns him partway: the crossing leg's step does the rest
                tn *= 0.6; tc = max(tcr, 0.6 * tc)
            ns = min(speed, plant_speed(deg)) * plant_keep(deg)
            v_out = unit(h + tn) * ns; drop = 0.10 * min(deg / 70, 1.3)
            mode = None
        elif kind == 'pivot':
            tc, tf = PIVOT_CONTACT, 0.06
            v_out = unit(g) * 2.0; drop = 0.2
            mode = None
        elif kind == 'push':
            pass
        elif kind == 'stop':
            tc = tcr * 1.3; tf = max(Tr - tc, 0.04) if speed > 2 else 0.0
            ns = max(speed - brake_rate(speed) * (tc + tf), 0.0)
            if ns < 0.6: ns = 0.0
            v_out = unit(h) * ns; drop = 0.05
        elif kind == 'stand':
            tc, tf = 0.5, 0.0
        if last in ('plant', 'pivot') and kind == 'run':
            # the first step off a plant or pivot: a push, speeding him up the new way
            kind = 'push'
            ns = min(want_v, speed + burst(speed) * 0.25)
            T2, tc2 = run_timing(max((speed + ns) / 2, 1.5)); tc, tf = min(PUSH_CONTACT, tc2 * 1.1), max(T2 - tc2, 0.05)
            v_out = unit(g) * ns
        # (no step pushes harder than a foot can: its push along the ground at most MU of the
        # push holding him up over the step. Turning comes first: what is left changes his speed.)
        if kind == 'pivot':
            dv = v_out - v; most = MU * G * (tc + tf)
            if np.hypot(*dv) > most: v_out = v + dv * (most / np.hypot(*dv))
        elif kind != 'stand':
            v_out = within(v, v_out, MU * G * (tc + tf), face, keep_speed=kind in ('plant', 'cross'))
        steps.append(Step(kind=kind, side=side, t=t, tc=tc, tf=tf, v_in=v.copy(), v_out=v_out.copy(), drop=drop, p_td=p.copy(), goal=g))
        # the body over the contact (velocity eased from in to out) and the flight
        n = max(int(round(tc * 120)), 1)
        for i in range(n):
            u = (i + 0.5) / n; w = (1 - math.cos(math.pi * u)) / 2
            p = p + (v + (v_out - v) * w) * (tc / n)
        p = p + v_out * tf
        since_cut = 0 if kind in ('plant', 'cross', 'pivot') else since_cut + 1
        last = kind
        v = v_out; t += tc + tf
        if np.hypot(*v) > 0.3: face = heading_of(v)
        side = 'R' if side == 'L' else 'L'
    return steps

def within(v, v_out, most, face, keep_speed=False):
    dv = v_out - v
    if np.hypot(*dv) <= most: return v_out
    sp = float(np.hypot(*v)); so = float(np.hypot(*v_out))
    a0 = heading_of(v, face); a1 = heading_of(v_out, a0); turn = ang(unit(a0), unit(a1))
    if sp < 0.3 or so < 0.3:
        return v + dv * (most / np.hypot(*dv))
    # the most of the turn he can make holding his speed
    lo, hi = 0.0, 1.0
    if np.hypot(*(unit(a1) * sp - v)) <= most: lo = 1.0
    else:
        for _ in range(30):
            mid = (lo + hi) / 2
            if np.hypot(*(unit(a0 + turn * mid) * sp - v)) <= most: lo = mid
            else: hi = mid
    way = unit(a0 + turn * lo)
    if lo < 1.0 or keep_speed:
        ns = sp if not keep_speed else min(sp, so)
        return way * ns if np.hypot(*(way * ns - v)) <= most + 1e-6 else way * sp
    # all of it: then as much of the change of speed as is left
    lo, hi = 0.0, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        if np.hypot(*(way * (sp + (so - sp) * mid) - v)) <= most: lo = mid
        else: hi = mid
    return way * (sp + (so - sp) * lo)

def describe(steps):
    for s in steps: print(' ', s)

if __name__ == '__main__':
    def script(parts):
        def f(t):
            for secs, deg, sp in parts:
                if t < secs: return (math.radians(deg) if sp > 0 else None, sp)
                t -= secs
            return (None, 0.0)
        return f
    for name, parts, v0 in [
            ('arc 25 at 8', [(1.0, 0, 8.0), (2.0, 25, 8.0)], (0, 8.0)),
            ('cut 45 at 7', [(1.0, 0, 7.0), (2.0, 45, 7.0)], (0, 7.0)),
            ('cut 90 at 8', [(1.0, 0, 8.0), (2.0, 90, 8.0)], (0, 8.0)),
            ('cut 90 at 4.6', [(1.0, 0, 4.6), (2.0, 90, 4.6)], (0, 4.6)),
            ('turn 180 at 8', [(1.0, 0, 8.0), (3.0, 180, 8.0)], (0, 8.0)),
            ('stop from 8', [(1.0, 0, 8.0), (2.0, 0, 0.0)], (0, 8.0)),
            ('start', [(3.0, 0, 9.5)], (0, 0))]:
        print(name)
        describe(plan(script(parts), sum(p[0] for p in parts), v0))
