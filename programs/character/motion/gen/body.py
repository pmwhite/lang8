# The body over the footsteps plan.py lays: a take (frames of directions, root, yaw, which feet
# are down) for the viewer, built from the measured run cycles (synth.py) and bent to the steps.
#
#   hips      along the path the steps push him on; their height bouncing as the steps' pushes
#             make it (the sine-wave model, per step), and lower through braking, plants, pivots
#   facing    the way he goes; through a plant or pivot, turned ahead of it (by mid-plant, most
#             of the cut: Nitschke et al.'s V-cuts turn the pelvis 45-90 degrees)
#   a foot    down where its push puts it: the force runs along the leg from the foot to his
#             hips, so a braking foot lands ahead, a cutting foot ahead and out
#   the legs  the cycle's, at the step's phase and his speed; the foot down held on its spot
#             (rocking heel to ball as the cycle's foot does), the foot in the air carried from
#             where it left to where it will land on the cycle's own path; both solved hip to
#             ankle with the cycle's knee direction
#   the trunk the cycle's, turned with the hips, leaning toward a cut (about 15 degrees at the
#             plant, as measured) and into an arc
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import synth as S, plan as P

legs_m, up_m = pickle.load(open('/tmp/chr/gen/means.pkl', 'rb'))
L1, L2, HIP, HIP_DROP = S.L1, S.L2, S.HIP, S.HIP_DROP
N = S.N
FPS = 30.0
SUB = 4      # computed at 120 a second, written at 30

import os
_disk = '/tmp/chr/gen/cycles.pkl'
_cyc = pickle.load(open(_disk, 'rb')) if os.path.exists(_disk) else {}
def cycle(v):
    key = round(max(min(v, 10.0), 1.5), 1)
    if key not in _cyc:
        _cyc[key] = S.cycle_at(key, legs_m, up_m)
        pickle.dump(_cyc, open(_disk, 'wb'))
    return _cyc[key]

def yaw_mat(psi):
    # turns run-frame vectors (x left, y up, z ahead) to world, facing psi (0: +z, + to the left)
    c, s = math.cos(psi), math.sin(psi)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def rodrigues(v, axis, a):
    axis = axis / max(np.linalg.norm(axis), 1e-9)
    return v * math.cos(a) + np.cross(axis, v) * math.sin(a) + axis * (axis @ v) * (1 - math.cos(a))

def smooth(u): u = min(max(u, 0.0), 1.0); return u * u * (3 - 2 * u)

def cycle_contact(v, sd):
    # where the run cycle at speed v has the foot's lower end (heel or ball) as it lands, from his
    # hips' point over the ground, in his frame (left, ahead); and whether it is the heel
    c = cyc_at(v, 0.0 if sd == 'R' else 0.5)
    sg = 1 if sd == 'L' else -1
    ank = c['pel_left'] * HIP * sg - c['pel_up'] * HIP_DROP + c[sd + 'thigh'] * L1 + c[sd + 'shank'] * L2
    ft = c[sd + 'foot']; up = S.foot_up(ft)
    heel = ank + ft * S.SOLE_HEEL[0] + up * S.SOLE_HEEL[1]; ball = ank + ft * S.SOLE_BALL[0] + up * S.SOLE_BALL[1]
    pt = heel if heel[1] < ball[1] else ball
    return np.array([pt[0], pt[2]]), bool(heel[1] < ball[1])

class Track:
    """The steps laid out in time, with his path, height, facing, and where each foot is down."""
    def __init__(s, steps):
        s.steps = steps
        s.t_end = steps[-1].t + steps[-1].tc + steps[-1].tf
        dt = 1 / 120; n = int(s.t_end / dt) + 2
        s.dt = dt; s.T = np.arange(n) * dt
        s.P = np.zeros((n, 2)); s.V = np.zeros((n, 2))
        p = steps[0].p_td.copy()
        for i, t in enumerate(s.T):
            k = s.step_at(t); st = steps[k]; u = (t - st.t)
            if u < st.tc:
                w = (1 - math.cos(math.pi * u / st.tc)) / 2
                v = st.v_in + (st.v_out - st.v_in) * w
            else: v = st.v_out
            s.V[i] = v; s.P[i] = p; p = p + v * dt
        s.place_feet(); s.heights(); s.facing()

    def step_at(s, t):
        k = 0
        while k + 1 < len(s.steps) and s.steps[k + 1].t <= t: k += 1
        return k

    def at(s, A, t):
        i = min(max(t / s.dt, 0), len(s.T) - 1.001); j = int(i); u = i - j
        return A[j] * (1 - u) + A[min(j + 1, len(A) - 1)] * u

    def place_feet(s):
        # Where each foot is put: where the run cycle at his speed puts it as it lands, moved by
        # whatever more the step's push asks than a steady step's (the push runs along the leg,
        # foot to hips: a braking foot lands further ahead, a cutting foot out).
        for st in s.steps:
            h = P.heading_of(st.v_in if np.hypot(*st.v_in) > 0.3 else st.v_out)
            side = 1 if st.side == 'L' else -1
            c0 = s.at(s.P, st.t)
            v = float(np.hypot(*st.v_in))
            if st.kind == 'stand':
                st.spot = c0 + P.left_of(h) * side * 0.12; st.td_heel = True
            else:
                off, st.td_heel = cycle_contact(max(v, 1.5), st.side)
                # (speeding up hard, he lands on the ball, as sprinters accelerating do)
                st.ball_only = (np.hypot(*st.v_out) - v) > 0.6 or st.kind == 'start'
                if st.ball_only: st.td_heel = False
                extra = np.zeros(2)
                if st.tc > 0:
                    dv = st.v_out - st.v_in
                    A = P.G * math.pi * (st.tc + st.tf) / (2 * st.tc)
                    ah = dv * math.pi / (2 * st.tc)
                    y_mid = 0.93 - st.drop
                    extra = 0.091 * dv * st.tc - ah / A * y_mid
                    # (the sideways part as the change-of-direction data has it: the plant foot
                    # 5-17 cm out at touchdown in Nitschke et al.'s V-cuts, where the leg's line
                    # alone would put it two or three times that)
                    along = extra @ P.unit(h)
                    # (and speeding up, the foot not much behind where a steady step's lands:
                    # the push shows in his lean)
                    if dv @ P.unit(h) > 0: along = max(along, 0.0)
                    extra = P.unit(h) * along + P.left_of(h) * (extra @ P.left_of(h)) * LATERAL
                f = c0 + P.left_of(h) * off[0] + P.unit(h) * off[1] + extra
                # (within his leg's reach of his hips as it lands: 0.39-0.44 m ahead when braking
                # hard, Harper et al. 2022)
                o = f - c0
                ahead = float(np.clip(o @ P.unit(h), -0.3, 0.6)); aside = float(np.clip(o @ P.left_of(h), -0.5, 0.5))
                st.spot = c0 + P.unit(h) * ahead + P.left_of(h) * aside
            # the foot's heading: the way he goes, but through a plant the way between
            ho = P.heading_of(st.v_out, h)
            st.foot_yaw = h + 0.5 * P.ang(P.unit(h), P.unit(ho)) + side * math.radians(4)
            if st.kind == 'pivot': st.foot_yaw = h + 0.4 * P.ang(P.unit(h), P.unit(ho))

    def heights(s):
        # the sine-wave model, step by step: each contact pushes up as much as the step needs
        # to land again level; lowered by each step's crouch
        y = np.zeros(len(s.T)); vy = -P.G * s.steps[0].tf / 2; yy = 0.0
        prev_tf = s.steps[0].tf
        for i, t in enumerate(s.T):
            st = s.steps[s.step_at(t)]; u = t - st.t
            if u < st.tc:
                A = P.G * math.pi * (st.tc + (st.tf + prev_tf) / 2) / (2 * st.tc) if st.tc > 0 else 0
                a = A * math.sin(math.pi * u / st.tc) - P.G
            else:
                a = -P.G
            if st.tf == 0 and u >= st.tc: a = 0; vy = 0
            vy += a * s.dt; yy += vy * s.dt; y[i] = yy
            nxt = s.step_at(t + s.dt)
            if nxt != s.steps.index(st): prev_tf = st.tf
        # (each step's level drift taken out, and its crouch put in)
        base = np.zeros(len(s.T))
        for k, st in enumerate(s.steps):
            m = (s.T >= st.t) & (s.T < st.t + st.tc + st.tf)
            if not m.any(): continue
            idx = np.where(m)[0]
            y0, y1 = y[idx[0]], y[min(idx[-1] + 1, len(y) - 1)]
            u = (s.T[idx] - st.t) / (st.tc + st.tf)
            y[idx] -= y0 + (y1 - y0) * u
            cu = np.clip((s.T[idx] - st.t) / max(st.tc, 1e-3), 0, 1)
            base[idx] = -st.drop * np.sin(math.pi * cu)
        # (the bounce, centred; smoothed where steps meet)
        k = np.ones(9) / 9
        s.Y = 0.95 + np.convolve(y + base, k, 'same')
        s.Y[:4] = s.Y[4]; s.Y[-4:] = s.Y[-5]

    def facing(s):
        # the way he goes, unwound (a reversal through a stop counted round the way he turns);
        # eased; and through a plant or pivot turned ahead of his path
        n = len(s.T)
        hv = np.zeros(n); h = P.heading_of(s.V[0]); spin = 1.0
        for st in s.steps:
            st.turn = 0.0
            if st.kind in ('plant', 'cross', 'pivot'):
                h0 = P.heading_of(st.v_in); h1 = st.goal if st.goal is not None else P.heading_of(st.v_out, h0)
                turn = P.ang(P.unit(h0), P.unit(h1))
                if st.kind == 'pivot' and abs(turn) > math.pi - 0.3:
                    turn = math.copysign(math.pi, turn if abs(turn) < math.pi - 0.01 else (1 if st.side == 'R' else -1))
                st.turn = turn
        for i in range(n):
            st = s.steps[s.step_at(s.T[i])]
            if st.turn: spin = math.copysign(1.0, st.turn)
            if np.hypot(*s.V[i]) > 0.3:
                d = P.ang(P.unit(h), P.unit(P.heading_of(s.V[i])))
                if abs(d) > 2.5: d = spin * (2 * math.pi - abs(d)) if d * spin < 0 else d
                h += d
            hv[i] = h
        # through a plant or pivot he faces round as planned: starting in the flight before, most
        # of it by mid-contact, all by its end; then on, eased, the way he goes
        hold = np.full(n, np.nan)
        for st in s.steps:
            if st.turn:
                i0 = min(max(int((st.t - 0.12) / s.dt), 0), n - 1)
                h0 = hv[i0]
                a = st.t - 0.12; m = st.t + st.tc * 0.5; b = st.t + st.tc
                for i, t in enumerate(s.T):
                    if a <= t <= b:
                        g = 0.85 * smooth((t - a) / (m - a)) if t < m else 0.85 + 0.15 * smooth((t - m) / (b - m))
                        hold[i] = h0 + st.turn * g
        f = hv[0]; psi = np.zeros(n); aim = None; aim_until = -1.0
        for i in range(n):
            if not np.isnan(hold[i]):
                f = hold[i]
                # (the way he goes then counted from where he faces)
                while hv[i] - f > math.pi: hv[i:] -= 2 * math.pi
                while f - hv[i] > math.pi: hv[i:] += 2 * math.pi
                aim = f; aim_until = s.T[i] + 1.0
            else:
                # (after a plant he keeps facing the new way while his path comes round to it)
                to = hv[i]
                if aim is not None and s.T[i] < aim_until and abs(aim - hv[i]) > 0.15: to = aim
                f = f + (to - f) * min(1.0, 12 * s.dt)
            psi[i] = f
        s.PSI = psi

    def down(s, side, t):
        # the step of this side that has the foot down at t, or None
        for st in s.steps:
            if st.side == side and st.t <= t < st.t + max(st.tc, 1e-3):
                return st
        # (standing, each foot stays where it was last put)
        if s.steps[s.step_at(t)].kind == 'stand':
            mine = [st for st in s.steps if st.side == side and st.t <= t]
            if mine: return mine[-1]
        return None

# ---- the pose, frame by frame ----
FOOT_LEN = S.SOLE_BALL[0] - S.SOLE_HEEL[0]
LATERAL = 0.4

def cyc_at(v, phase):
    # the cycles at his speed, a blend of the two nearest tenths of a m/s, sampled at phase
    v = max(min(v, 10.0), 1.5)
    lo = math.floor(v * 10) / 10; hi = lo + 0.1; f = (v - lo) / 0.1
    a = S.sample(cycle(lo), phase); b = S.sample(cycle(hi), phase)
    out = {}
    for k in a:
        w = a[k] * (1 - f) + b[k] * f
        out[k] = w / np.linalg.norm(w) if np.ndim(w) == 1 and len(w) == 3 else w
    out['duty'] = cycle(lo)['events'][1] * (1 - f) + cycle(hi)['events'][1] * f
    return out

def ik(hip, ankle, pole):
    # thigh and shank directions that put the ankle at `ankle`, the knee toward `pole`
    d = ankle - hip; dist = np.linalg.norm(d)
    dist = min(max(dist, abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4); dn = d / max(np.linalg.norm(d), 1e-9)
    k = pole - dn * (pole @ dn)
    if np.linalg.norm(k) < 1e-6: k = np.array([0.0, 0.0, 1.0]) - dn * dn[2]
    k /= np.linalg.norm(k)
    ca = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist); sa = math.sqrt(max(1 - ca * ca, 0))
    knee = hip + L1 * (dn * ca + k * sa)
    th = (knee - hip) / L1; sh = hip + dn * dist - knee; sh /= np.linalg.norm(sh)
    return th, sh

def foot_up(ft): return S.foot_up(ft)

class Builder:
    def __init__(s, track):
        s.tr = track
        s.ph = np.zeros(len(track.T)); s.spd = np.zeros(len(track.T))
        for i, t in enumerate(track.T):
            k = track.step_at(t); st = track.steps[k]
            v = float(np.hypot(*track.V[i])); s.spd[i] = v
            duty = cyc_at(max(v, 1.5), 0.0)['duty']
            base = 0.0 if st.side == 'R' else 0.5
            u = t - st.t
            if u < st.tc: s.ph[i] = base + duty * u / max(st.tc, 1e-3)
            else: s.ph[i] = base + duty + (0.5 - duty) * (u - st.tc) / max(st.tf, 1e-3)
            if st.kind == 'stand': s.ph[i] = base + duty * 0.5
        s.ph %= 1.0

    def prepare(s):
        # his hips' height: the cycle's, lowered by the step's crouch, and further wherever a
        # foot down would otherwise be out of the leg's reach (the knee kept bent 12 degrees)
        tr = s.tr; n = len(tr.T)
        reach = math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(math.radians(12)))
        base = np.zeros(n); most = np.full(n, 9.0)
        for i in range(n):
            t = tr.T[i]; c = cyc_at(max(s.spd[i], 1.5), s.ph[i]); R = yaw_mat(tr.PSI[i])
            base[i] = c['root_y'] + tr.CROUCH[i]
            for sd, sg in (('L', 1), ('R', -1)):
                st = tr.down(sd, t)
                if st is None: continue
                off = R @ (c['pel_left'] * HIP * sg - c['pel_up'] * HIP_DROP)
                hip0 = np.array([tr.P[i][0], base[i], tr.P[i][1]]) + off
                ankle, _ = s.reached(st, c, sd, t, hip0)
                hx = tr.P[i][0] + off[0] - ankle[0]; hz = tr.P[i][1] + off[2] - ankle[2]
                dh2 = hx * hx + hz * hz
                if dh2 < reach * reach:
                    most[i] = min(most[i], ankle[1] - off[1] + math.sqrt(reach * reach - dh2))
                else:
                    most[i] = min(most[i], ankle[1] - off[1])
        y = np.minimum(base, most)
        # (smoothly: a lowering is begun a little before it is needed, and let go after)
        k = 7
        low = np.array([y[max(0, j - k):j + k + 1].min() for j in range(n)])
        g = np.exp(-np.linspace(-2, 2, 2 * k + 1) ** 2); g /= g.sum()
        sm = np.convolve(np.pad(low, k, mode='edge'), g, 'valid')
        # (but never more than 15 cm below the cycle's: past that the foot lets go early)
        s.Y = np.maximum(np.minimum(sm, most + 0.01), base - 0.15)

    def frame(s, i, prev=None):
        tr = s.tr; t = tr.T[i]; v = s.spd[i]; psi = tr.PSI[i]; R = yaw_mat(psi)
        c = cyc_at(max(v, 1.5), s.ph[i])
        W = {k: R @ c[k] for k in S.DIRS}
        # leans: toward a cut at its plant, into an arc, into speeding up
        a = tr.at(tr.A, t) if hasattr(tr, 'A') else np.zeros(2)
        fwd = np.array([math.sin(psi), 0, math.cos(psi)]); left = np.array([math.cos(psi), 0, -math.sin(psi)])
        a_side = a[0] * left[0] + a[1] * left[2]; a_ahead = a[0] * fwd[0] + a[1] * fwd[2]
        # (a cut's lean in place of an arc's, not on top of it)
        cut = tr.at(tr.CUTLEAN, t); arc = max(-0.2, min(0.2, 0.5 * math.atan2(a_side, P.G)))
        w = min(abs(cut) / math.radians(8), 1.0)
        side_lean = cut + arc * (1 - w)
        fwd_lean = math.atan2(a_ahead, P.G) * (0.9 if a_ahead > 0 else 0.25)
        # (through a plant his push is the cut's, not a drive ahead: no lean into it)
        fwd_lean *= 1 - w
        # (an arc's lean across the way he faces; a cut's across the way he came in)
        ch = tr.CUTHEAD[min(i, len(tr.CUTHEAD) - 1)] if abs(cut) > 1e-3 else psi
        cut_axis = np.array([math.sin(ch), 0, math.cos(ch)])
        for k in ('pel_left', 'pel_up', 'chest_left', 'chest_up', 'head_left', 'head_nose', 'Luparm', 'Lforearm', 'Ruparm', 'Rforearm'):
            share = 0.5 if k.startswith('pel') or k.startswith('head') else 1.0
            d = rodrigues(W[k], fwd, -arc * (1 - w) * share)
            d = rodrigues(d, cut_axis, -cut * share)
            W[k] = rodrigues(d, left, fwd_lean * share)
        y = s.Y[i]
        root = np.array([tr.at(tr.P, t)[0], y, tr.at(tr.P, t)[1]])
        down = {}
        for sd, sg in (('L', 1), ('R', -1)):
            hip = root + W['pel_left'] * HIP * sg - W['pel_up'] * HIP_DROP
            st = tr.down(sd, t)
            pole = R @ (c[sd + 'thigh'] * 0.3 + np.cross(np.array([sg * 0.0 + 1.0, 0, 0]), c[sd + 'thigh']) * 0)
            knee_way = R @ np.cross(np.cross(c[sd + 'thigh'], c[sd + 'shank']), np.array([1.0, 0, 0]) * -1)
            if st is not None:
                ankle, ft = s.reached(st, c, sd, t, hip)
                fy = np.array([math.sin(st.foot_yaw), 0, math.cos(st.foot_yaw)])
                pole = fy * 0.7 + fwd * 0.3
                down[sd] = True
            else:
                ankle, ft = s.swinging(sd, i, c, W, hip)
                pole = R @ s.knee_dir(c, sd)
                down[sd] = False
            th, sh = ik(hip, ankle, pole)
            W[sd + 'thigh'], W[sd + 'shank'], W[sd + 'foot'] = th, sh, ft
        return W, root, psi, down

    def knee_dir(s, c, sd):
        # the cycle's knee: the way it points from the hip-ankle line
        th, sh = c[sd + 'thigh'], c[sd + 'shank']
        a = th * L1 + sh * L2; an = a / np.linalg.norm(a)
        k = th - an * (th @ an)
        return k / max(np.linalg.norm(k), 1e-9) if np.linalg.norm(k) > 1e-6 else np.array([0, 0, 1.0])

    def foot_dir(s, c, sd, yaw):
        # the cycle's foot pitch, heading `yaw`
        f = c[sd + 'foot']; pitch = math.atan2(f[1], math.hypot(f[0], f[2]))
        return np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch)])

    def planted(s, st, c, sd, t):
        # the foot down: heel or ball (whichever the cycle's pitch has lower) held on its spot
        fy = st.foot_yaw if st.kind != 'pivot' else st.foot_yaw + getattr(st, 'turn', 0) * 0.5 * smooth((t - st.t) / max(st.tc, 1e-3))
        ft = s.foot_dir(c, sd, fy)
        if getattr(st, 'ball_only', False) and ft[1] > -0.2:
            # (the heel kept up off the ground)
            ft = np.array([math.sin(fy) * 0.98, -0.2, math.cos(fy) * 0.98]); ft /= np.linalg.norm(ft)
        if st.kind == 'stand': ft = np.array([math.sin(fy), 0.0, math.cos(fy)])
        up = foot_up(ft)
        ball = ft * S.SOLE_BALL[0] + up * S.SOLE_BALL[1]; heel = ft * S.SOLE_HEEL[0] + up * S.SOLE_HEEL[1]
        way = np.array([math.sin(st.foot_yaw), 0, math.cos(st.foot_yaw)])
        if st.td_heel:
            heel_spot = np.array([st.spot[0], 0.006, st.spot[1]]); ball_spot = heel_spot + way * FOOT_LEN
        else:
            ball_spot = np.array([st.spot[0], 0.006, st.spot[1]]); heel_spot = ball_spot - way * FOOT_LEN
        if heel[1] < ball[1]: ankle = heel_spot - heel
        else:
            lift = 0.1 * max(-ft[1] - 0.5, 0.0)
            ankle = ball_spot + np.array([0, lift, 0]) - ball
        return ankle, ft

    def reached(s, st, c, sd, t, hip):
        # the foot down as planted(), but on its ball rising onto the toes as far as it must
        # (to 75 degrees) for the leg to reach it with the knee still bent 15 degrees
        ankle, ft = s.planted(st, c, sd, t)
        reach = math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(math.radians(15)))
        if np.linalg.norm(ankle - hip) <= reach: return ankle, ft
        up = foot_up(ft); ball = ft * S.SOLE_BALL[0] + up * S.SOLE_BALL[1]
        if ball[1] > (ft * S.SOLE_HEEL[0] + up * S.SOLE_HEEL[1])[1] + 1e-6: return ankle, ft
        ball_at = ankle + ball
        way = np.array([ft[0], 0, ft[2]]); way /= max(np.linalg.norm(way), 1e-9)
        p0 = math.atan2(ft[1], math.hypot(ft[0], ft[2]))
        best = (ankle, ft)
        for k in range(1, 21):
            pitch = p0 + (math.radians(-75) - p0) * k / 20
            if pitch > p0: break
            f2 = way * math.cos(pitch) + np.array([0, math.sin(pitch), 0]); u2 = foot_up(f2)
            lift = 0.1 * max(-f2[1] - 0.5, 0.0) - 0.1 * max(-ft[1] - 0.5, 0.0)
            a2 = ball_at + np.array([0, lift, 0]) - (f2 * S.SOLE_BALL[0] + u2 * S.SOLE_BALL[1])
            best = (a2, f2)
            if np.linalg.norm(a2 - hip) <= reach: break
        return best

    def swinging(s, sd, i, c, W, hip):
        # carried from where it left to where it will land, along the cycle's own path
        tr = s.tr; t = tr.T[i]
        prev = [st for st in tr.steps if st.side == sd and st.t + st.tc <= t]
        nxt = [st for st in tr.steps if st.side == sd and st.t > t]
        R = yaw_mat(tr.PSI[i])
        a_here = hip + R @ (c[sd + 'thigh'] * L1 + c[sd + 'shank'] * L2)
        yaw_here = tr.PSI[i]
        if not prev or not nxt:
            return a_here, s.foot_dir(c, sd, yaw_here)
        p, n = prev[-1], nxt[0]
        t0, t1 = p.t + p.tc, n.t
        u = smooth((t - t0) / max(t1 - t0, 1e-3))
        corr0 = s.ankle_err(sd, p, t0, leaving=True); corr1 = s.ankle_err(sd, n, t1, leaving=False)
        ankle = a_here + corr0 * (1 - u) + corr1 * u
        fy = p.foot_yaw + P.ang(P.unit(p.foot_yaw), P.unit(n.foot_yaw)) * u
        return ankle, s.foot_dir(c, sd, fy)

    def ankle_err(s, sd, st, t, leaving):
        # where the foot is (leaving) or will be (landing) less where the cycle's path has it then
        tr = s.tr; i = min(max(int(round(t / tr.dt)), 0), len(tr.T) - 1)
        if leaving: i = max(i - 1, 0)
        c = cyc_at(max(s.spd[i], 1.5), s.ph[i]); R = yaw_mat(tr.PSI[i])
        y = s.Y[i]
        root = np.array([tr.P[i][0], y, tr.P[i][1]])
        sg = 1 if sd == 'L' else -1
        pl = R @ c['pel_left']; pu = R @ c['pel_up']
        hip = root + pl * HIP * sg - pu * HIP_DROP
        cyc = hip + R @ (c[sd + 'thigh'] * L1 + c[sd + 'shank'] * L2)
        want, _ = s.planted(st, c, sd, st.t if not leaving else st.t + st.tc - 1e-3)
        return want - cyc

def extras(track):
    # what the frames need besides: his push (to lean into), the lean toward a cut, the crouch
    n = len(track.T)
    A = np.gradient(track.V, track.dt, axis=0)
    k = np.ones(13) / 13
    track.A = np.stack([np.convolve(A[:, 0], k, 'same'), np.convolve(A[:, 1], k, 'same')], 1)
    lean = np.zeros(n); crouch = np.zeros(n); head = np.zeros(n)
    for st in track.steps:
        m = (track.T >= st.t - 0.1) & (track.T < st.t + st.tc + st.tf + 0.15)
        u = (track.T[m] - st.t) / max(st.tc, 1e-3)
        bump = np.sin(math.pi * np.clip(u, 0, 1))
        crouch[m] = np.minimum(crouch[m], -st.drop * bump)
        if st.kind in ('plant', 'cross') and hasattr(st, 'turn'):
            # toward the cut by mid-plant: with his usual lean ahead, the trunk about 15-20 degrees
            # over (Nitschke et al.'s V-cuts: 10-35, median 16, measured the same way)
            w = np.exp(-((track.T[m] - (st.t + st.tc * 0.5)) / (st.tc * 0.7 + 0.05)) ** 2)
            lean[m] += math.copysign(math.radians(10) * min(abs(st.turn) / math.radians(60), 1.3), st.turn) * w
            # (measured across the way he came in, as the data's lean is)
            head[m] = P.heading_of(st.v_in)
    track.CUTLEAN = lean; track.CROUCH = crouch; track.CUTHEAD = head

def take_lines(name, track, seconds=None):
    extras(track); b = Builder(track); b.prepare()
    lines = [f"take {name} run {FPS:.0f}", "  like free", "  hands hand"]
    n = int((seconds or track.T[-1] - 0.05) * FPS)
    for f in range(n):
        i = int(round(f / FPS / track.dt))
        if i >= len(track.T): break
        W, root, psi, down = b.frame(i)
        nums = []
        for k in S.DIRS: nums += list(W[k] / np.linalg.norm(W[k]))
        nums += [root[0], root[1], root[2], psi]
        lines.append("  at " + " ".join(f"{x:.3f}" for x in nums) + f" {int(down.get('L', False))} {int(down.get('R', False))}")
    return lines
