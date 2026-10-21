# synth.py: a running back's runs, sprint and burst as takes for the viewer's motion matching.
#
# Where every part comes from:
#   legs and pelvis, all three planes, 2.5-4.5 m/s: the mean of 25 runners in the Fukuchi running
#     dataset (rbds.py), each stride registered to the mean contact events before averaging;
#   chest, head and arms, relative to the pelvis: the mean of CMU motion capture runs (cmu.py),
#     registered the same way;
#   above 4.5 m/s (no open 3D data): the 4.5 m/s cycle reshaped in its sagittal plane to sprint
#     values from the literature (steps a second, support time, thigh and knee extremes, trunk
#     lean), with its frontal and transverse motion kept and scaled by the trend the data shows;
#   speeding up (the burst): body lean from the acceleration (lean ~ atan(a/g)), as sprint
#     acceleration studies describe the trunk rising as speed builds.
import sys, os, math, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import rbds, cmu
N = 101
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)
def events(c):
    # R on (0), R off, L on, L off: shares of the stride
    r, l = c['downR'], c['downL']
    roff = np.argmax(~r[1:]) + 1 if (~r[1:]).any() else 40
    lon = np.argmax(l[roff:]) + roff if l[roff:].any() else 50
    loff_rel = np.argmax(~l[lon:]) if (~l[lon:]).any() else 40
    return np.array([0, roff, lon, lon + loff_rel, 100]) / 100.0
def warp(c, ev, mev):
    # resample cycle c so that its events ev land at the mean events mev
    t = np.linspace(0, 1, N)
    src = np.interp(t, mev, ev) * 100
    out = {}
    for k, v in c.items():
        if isinstance(v, np.ndarray) and v.ndim == 2 and v.shape[0] == N:
            out[k] = np.stack([np.interp(src, np.arange(N), v[:, j]) for j in range(3)], 1)
        elif isinstance(v, np.ndarray) and v.ndim == 1 and v.shape[0] == N and v.dtype != bool:
            out[k] = np.interp(src, np.arange(N), v)
    return out
def mean_cycle(cycs, keys):
    evs = np.array([events(c) for c in cycs]); mev = evs.mean(0)
    ws = [warp(c, e, mev) for c, e in zip(cycs, evs)]
    m = {}
    for k in keys:
        v = np.mean([w[k] for w in ws], 0)
        m[k] = unit(v) if v.ndim == 2 else v
    m['events'] = mev
    m['T'] = np.mean([c['T'] for c in cycs])
    m['leg'] = np.mean([c['leg'] for c in cycs])
    return m
LEG_KEYS = ['pel_left', 'pel_up', 'Lthigh', 'Lshank', 'Lfoot', 'Rthigh', 'Rshank', 'Rfoot', 'hip_y', 'hip_x', 'Lankle_x', 'Rankle_x']
UP_KEYS = ['pel_left', 'pel_up', 'chest_left', 'chest_up', 'head_left', 'head_nose', 'Luparm', 'Lforearm', 'Ruparm', 'Rforearm']
def rbds_mean(speed):
    cyc = []
    for sid in range(1, 40):
        try: cs = rbds.cycles(sid, speed)
        except Exception: continue
        if len(cs) >= 5: cyc += cs[:15]
    return mean_cycle(cyc, LEG_KEYS), len(cyc)
CMU_RUNS = ['09_01', '09_02', '09_03', '09_04', '09_05', '09_06', '09_07', '09_08', '09_09', '09_10', '09_11', '16_35', '16_36', '16_45', '16_46', '16_55', '16_56',
            '35_17', '35_18', '35_19', '35_20', '35_21', '35_22', '35_23', '35_24', '35_25', '35_26', '127_03', '127_06', '127_07', '141_01', '141_02', '141_03', '143_01', '143_42']
def cmu_mean():
    cyc = []
    for t in CMU_RUNS:
        try: cyc += cmu.cycles(t, min_speed=2.3)
        except Exception as e: pass
    # (CMU cycles start at the left foot: shift half a stride to start at the right, as RBDS's do.)
    sh = []
    for c in cyc:
        d = {}
        for k, v in c.items():
            if isinstance(v, np.ndarray) and v.shape[0] == N: d[k] = np.roll(v[:-1], 50, axis=0); d[k] = np.concatenate([d[k], d[k][:1]], 0)
            else: d[k] = v
        sh.append(d)
    return mean_cycle(sh, UP_KEYS), len(cyc), np.mean([c['speed'] for c in cyc])

# ---- reshaping ----
def sag(v):
    # a direction as (sideways part, angle forward of straight down in the remaining plane)
    x = v[:, 0]; r = np.sqrt(np.maximum(1 - x * x, 1e-9))
    return x, np.arctan2(v[:, 2], -v[:, 1]), r
def unsag(x, th, r):
    return np.stack([x, -np.cos(th) * r, np.sin(th) * r], 1)
def rot(v, axis, ang):
    # Rodrigues, per row
    axis = unit(axis); c = np.cos(ang)[:, None]; s = np.sin(ang)[:, None]
    return v * c + np.cross(axis, v) * s + axis * (np.einsum('ij,ij->i', axis, v)[:, None]) * (1 - c)
def turn_between(a, b):
    # per-row rotation (axis, angle) taking a to b
    ax = np.cross(a, b); n = np.linalg.norm(ax, axis=1)
    ax = np.where(n[:, None] > 1e-9, ax / np.maximum(n, 1e-9)[:, None], np.array([1.0, 0, 0]))
    return ax, np.arctan2(n, np.einsum('ij,ij->i', a, b))
def warp_to(m, ev):
    w = warp({k: v for k, v in m.items() if isinstance(v, np.ndarray) and v.shape[:1] == (N,)}, m['events'], ev)
    out = dict(m); out.update(w); out['events'] = ev; return out
def blend(A, B, f):
    ev = A['events'] * (1 - f) + B['events'] * f
    A2, B2 = warp_to(A, ev), warp_to(B, ev); out = dict(A2)
    for k, v in A2.items():
        if isinstance(v, np.ndarray) and v.shape[:1] == (N,):
            w = v * (1 - f) + B2[k] * f
            out[k] = unit(w) if w.ndim == 2 else w
    out['T'] = A['T'] * (1 - f) + B['T'] * f; out['events'] = ev
    return out
def scale_sag(v, k, mean=None):
    x, th, r = sag(v); m = th.mean() if mean is None else mean
    return unsag(x, m + (th - m) * k, r)
def scale_yaw(left, k):
    # a left-pointing direction's turn about up, scaled about its mean
    a = np.arctan2(-left[:, 2], left[:, 0]); m = a.mean()
    a2 = m + (a - m) * k; return np.stack([np.cos(a2) * np.sqrt(1 - left[:, 1] ** 2), left[:, 1], -np.sin(a2) * np.sqrt(1 - left[:, 1] ** 2)], 1)
SPRINT = dict(v=9.5, steps=4.55, support=0.10, thigh=(-33.0, 72.0), knee_contact=18.0, knee_swing=133.0,
              chest_lean=12.0, pelvis_yaw_k=1.3, bounce_k=0.7, arm_k=1.6)
# The sprint's sagittal shape, from the literature on maximal-velocity sprinting: touchdown with
# the thigh ~30 degrees forward and the knee ~18 degrees bent (foot landing ~0.25 m ahead of the
# hips); the knee bending to ~40 in support and leaving at ~25 (take-off knee ~155 deg inside);
# thigh driven back to ~33 behind; the heel folded up to ~133 degrees of knee bend as the thigh comes
# through; full knee lift ~72 degrees with the shin hanging near vertical (knee ~80); then the leg
# swung down and opened to touch down. Phases are shares of the stride from this foot's touchdown,
# support ending at the stride's support share. Foot pitch (+ toe up) lands on the ball.
SPRINT_KEYS = {
    'thigh': [(0.0, 27), ('off', -33), (0.30, -30), (0.55, 18), (0.74, 72), (0.91, 48), (1.0, 27)],
    'knee': [(0.0, 18), (0.10, 40), ('off', 25), (0.46, 127), (0.74, 80), (0.91, 38), (1.0, 18)],
    # the ankle: degrees between up-the-shin and heel-to-toe (90 = foot square to the shin):
    # landing on the ball a little pointed, bending in support, pushing off pointed, and in the air
    # hanging relaxed, drawn up for the landing
    'ankle': [(0.0, 100), (0.10, 82), ('off', 128), (0.45, 112), (0.75, 95), (0.92, 98), (1.0, 100)],
}
def keyed(keys, off, ph):
    xs = np.array([off if k == 'off' else k for k, _ in keys]); ys = np.radians([y for _, y in keys])
    # smooth through the keys (cubic Hermite with finite-difference slopes), periodic
    xs2 = np.concatenate([xs[-2:-1] - 1, xs, xs[1:2] + 1]); ys2 = np.concatenate([ys[-2:-1], ys, ys[1:2]])
    m = np.gradient(ys2, xs2)
    i = np.clip(np.searchsorted(xs2, ph) - 1, 0, len(xs2) - 2)
    h = xs2[i + 1] - xs2[i]; t = (ph - xs2[i]) / h
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
    return h00 * ys2[i] + h10 * h * m[i] + h01 * ys2[i + 1] + h11 * h * m[i + 1]
def sprintify(m, v):
    f = np.clip((v - 4.5) / (SPRINT['v'] - 4.5), 0, 1.1)
    if f <= 0: return m
    m = dict(m)
    T = 1 / (1 / m['T'] * (1 - f) + SPRINT['steps'] / 2 * f)
    # (support distance at top speed 0.89 m for sprinters' legs, ~0.92 m hip to ankle (Nagahara
    # 2014): scaled to these legs, and divided by his speed for the support time)
    sd_data = m['events'][1] * m['T'] * 4.5
    sd = sd_data * (1 - f) + 0.89 * (L1 + L2) / 0.92 * f
    duty = sd / max(v, 1.0) / T
    ev = np.array([0, duty, 0.5, 0.5 + duty, 1.0]); m = warp_to(m, ev); m['T'] = T
    ph = np.linspace(0, 1, N)
    for s, shift in (('R', 0.0), ('L', 0.5)):
        p = (ph - shift) % 1.0
        th, sh, ft = m[s + 'thigh'], m[s + 'shank'], m[s + 'foot']
        x, a, r = sag(th)
        a2 = a * (1 - f) + keyed(SPRINT_KEYS['thigh'], duty, p) * f
        th2 = unsag(x, a2, r)
        kn = np.arccos(np.clip(np.einsum('ij,ij->i', th, sh), -1, 1))
        kn2 = kn * (1 - f) + keyed(SPRINT_KEYS['knee'], duty, p) * f
        axis = np.cross(th, sh); small = np.linalg.norm(axis, axis=1) < 1e-3
        axis[small] = np.array([1.0, 0, 0]); axis = unit(axis)
        ta, tang = turn_between(th, th2)
        axis2 = rot(axis, ta, tang)
        # (a knee bends one way: its axis points to the figure's left, give or take)
        axis2 = unit(np.where((axis2[:, 0] < 0)[:, None], -axis2, axis2))
        sh2 = rot(th2, axis2, kn2)
        # the foot: its angle to the shin toward the sprint's, about the knee's axis
        up_shin = -sh
        ank = np.arccos(np.clip(np.einsum('ij,ij->i', up_shin, ft), -1, 1))
        ank2 = ank * (1 - f) + keyed(SPRINT_KEYS['ankle'], duty, p) * f
        m[s + 'foot'] = unit(rot(-sh2, axis2, ank2))
        m[s + 'thigh'], m[s + 'shank'] = th2, sh2
    m['pel_left'] = scale_yaw(m['pel_left'], 1 + (SPRINT['pelvis_yaw_k'] - 1) * f)
    m['hip_y'] = m['hip_y'] * (1 + (SPRINT['bounce_k'] - 1) * f)
    for s in 'LR':
        k = s + 'uparm'
        if k in m: m[k] = scale_sag(m[k], 1 + (SPRINT['arm_k'] - 1) * f)
    return m
# Dynamic similarity (Froude): this figure's legs are shorter than the data's, so a shape the data
# shows at speed vd belongs to him at vd * sqrt(L / Ld), with strides sqrt(L / Ld) as long in time
# and L / Ld as long in space: then his foot sweeps back exactly as far as he goes.
_cycles = {}
def cycle_at(v, legs, up):
    # (by speed to a tenth of a m/s: the burst asks for one a frame)
    key = round(v, 1)
    if key not in _cycles: _cycles[key] = cycle_at_exact(key, legs, up)
    return _cycles[key]
def cycle_at_exact(v, legs, up):
    Ld = np.mean([m['leg'] for m in legs.values()]); k = math.sqrt((L1 + L2) / Ld)
    c = cycle_at_data(v / k, legs, up)
    c['T'] = c['T'] * k
    return settle(c, v)
def cycle_at_data(v, legs, up):
    sp = sorted(legs)
    if v <= sp[0]: c = dict(legs[sp[0]])
    elif v >= sp[-1]: c = dict(legs[sp[-1]])
    else:
        i = max(j for j in range(len(sp)) if sp[j] <= v); a, b = sp[i], sp[min(i + 1, len(sp) - 1)]
        c = blend(legs[a], legs[b], 0 if a == b else (v - a) / (b - a))
    u = warp_to(up, c['events'])
    k = np.clip(0.75 + 0.25 * (v - 2.5) / 1.0, 0.75, 1.25) if v <= 4.5 else 1.25
    for key in ('chest_left', 'chest_up', 'head_left', 'head_nose', 'Luparm', 'Lforearm', 'Ruparm', 'Rforearm'):
        c[key] = u[key]
    for s in 'LR': c[s + 'uparm'] = scale_sag(c[s + 'uparm'], k)
    # The trunk's lean, set from the literature: about 8 degrees jogging (Teng and Powers' runners
    # average 7-9), and the upper trunk about 14 at sprint speed (Nagahara: 75.7 degrees from the
    # horizontal). (The CMU subjects lean 15 jogging, likely their suits and the capture space.)
    want = np.radians(8.0 + 4.0 * np.clip((v - 4.5) / 5.0, 0, 1))
    cu = c['chest_up']; have = np.arctan2(cu[:, 2], cu[:, 1]).mean()
    c['chest_up'] = rot(cu, np.repeat(np.array([[1.0, 0, 0]]), N, 0), np.full(N, want - have))
    c['chest_left'] = rot(c['chest_left'], np.repeat(np.array([[1.0, 0, 0]]), N, 0), np.full(N, want - have))
    c['chest_left'] = scale_yaw(c['chest_left'], k)
    if v < sp[0]:
        # slower than the data: longer strides in time, the same shapes
        c['T'] = c['T'] * (sp[0] / v) ** 0.25
    return sprintify(c, v)

L1, L2, HIP, HIP_DROP = 0.43, 0.42, 0.098, 0.05
def as_stats(c):
    # a cycle in the form stats.metrics measures (with this figure's lengths)
    d = dict(c)
    ph = np.linspace(0, 1, N); e = c['events']
    d['downR'] = ph < e[1]; d['downL'] = (ph >= e[2]) & (ph < e[3]); d['leg'] = L1 + L2
    for s, sg in (('L', 1), ('R', -1)):
        hip = c['pel_left'] * HIP * sg - c['pel_up'] * HIP_DROP
        an = hip + c[s + 'thigh'] * L1 + c[s + 'shank'] * L2
        d[s + 'ankle_x'] = an[:, 0]
    return d

# ---- takes ----
FPS = 30.0
def sample(c, phase):
    p = (phase % 1.0) * (N - 1); i = int(p); u = p - i; j = min(i + 1, N - 1)
    out = {}
    for k, v in c.items():
        if isinstance(v, np.ndarray) and v.shape[:1] == (N,):
            w = v[i] * (1 - u) + v[j] * u
            out[k] = w / np.linalg.norm(w) if v.ndim == 2 else w
    return out
def lean(v, ang):
    # turned forward (about the left axis) by ang radians
    return rot(v[None, :], np.array([[1.0, 0, 0]]), np.array([ang]))[0]
DIRS = ['pel_left', 'pel_up', 'chest_left', 'chest_up', 'head_left', 'head_nose', 'Luparm', 'Lforearm', 'Ruparm', 'Rforearm',
        'Lthigh', 'Lshank', 'Rthigh', 'Rshank', 'Lfoot', 'Rfoot']
def frame_line(s, root, yaw, downL, downR, accel_lean=0.0):
    ds = []
    for k in DIRS:
        d = s[k]
        # the viewer's frame: x is the figure's left, y up, z ahead: the same as the run's
        if accel_lean:
            # leaning into speeding up: the trunk all of it, the legs half (pushing back)
            share = 1.0 if k in ('pel_up', 'chest_up', 'head_nose', 'pel_left', 'chest_left', 'head_left') else (0.5 if k[1:] in ('thigh', 'shank', 'foot') else 0.7)
            d = lean(d, accel_lean * share)
        ds += list(d)
    nums = ds + [root[0], root[1], root[2], yaw]
    return "  at " + " ".join(f"{x:.3f}" for x in nums) + f" {int(downL)} {int(downR)}"
def base_height(c):
    ph = np.linspace(0, 1, N); st = ph < c['events'][1]
    chain = (-c['pel_up'] * HIP_DROP + c['Rthigh'] * L1 + c['Rshank'] * L2)[:, 1] + c['hip_y'] * (L1 + L2) / c['leg']
    # the stance ankle's mean height: the rest ankle's, 0.091 m, and a little for the sole
    return 0.097 - chain[st].mean()
def steady(name, v, legs, up, seconds=6.0):
    c = cycle_at(v, legs, up); base = base_height(c); e = c['events']
    lines = [f"take {name} run {FPS:.0f}", "  like free", "  hands hand"]
    for i in range(int(seconds * FPS)):
        t = i / FPS; ph = (t / c['T']) % 1.0; s = sample(c, ph)
        root = (s['hip_x'] * (L1 + L2) / c['leg'], s['root_y'], v * t + s['root_dz'])
        lines.append(frame_line(s, root, 0.0, e[2] <= ph < e[3], ph < e[1]))
    return lines
def burst(name, legs, up, v0=2.2, top=10.4, a0=9.5, seconds=4.0):
    lines = [f"take {name} run {FPS:.0f}", "  like free", "  hands hand"]
    v, z, ph = v0, 0.0, 0.0
    sub = 8
    for i in range(int(seconds * FPS)):
        a = a0 * max(1 - v / top, 0.0)
        c = cycle_at(v, legs, up); base = base_height(c); e = c['events']
        s = sample(c, ph)
        root = (s['hip_x'] * (L1 + L2) / c['leg'], s['root_y'], z + s['root_dz'])
        # lean ~ atan(a / g): the push and gravity's turn about the foot balance
        lines.append(frame_line(s, root, 0.0, e[2] <= ph < e[3], ph < e[1], accel_lean=math.atan(a / 9.81) * 0.9))
        for _ in range(sub):
            dt = 1 / FPS / sub
            a = a0 * max(1 - v / top, 0.0); v += a * dt; z += v * dt; ph = (ph + dt / cycle_at(v, legs, up)['T']) if False else ph + dt / c['T']
    return lines
HEADER = """# Running, synthesized from data (see programs/character/motion/README.md and the generator
# programs/character/motion/gen/synth.py): legs and pelvis in all three planes from the mean of 25
# runners of the Fukuchi running dataset (PeerJ 5:e3298, figshare 10.6084/m9.figshare.4543435,
# CC BY 4.0) at 2.5, 3.5 and 4.5 m/s; chest, head and arms from the mean of CMU Graphics Lab motion
# capture runs (mocap.cs.cmu.edu, NSF EIA-0196217); faster than 4.5 m/s, that cycle reshaped to
# sprint values from the literature, the hips bouncing as in Morin et al.'s spring-mass model; the
# feet rocking heel to ball on one spot through support; the burst leaning into its acceleration.
"""
# ---- stride warping: feet that stay where they land ----
BALL = 0.13      # ankle to the ball of the foot, along the foot
SOLE_BALL = (0.127, -0.063)
BALL_Y = 0.03    # the ball's height when down
def leg_from(c, s, i, a):
    # leg s at frame i with its thigh at sagittal angle a: (thigh, shank, foot), the knee's and
    # ankle's bends as they were
    th, sh, ft = c[s + 'thigh'][i:i + 1], c[s + 'shank'][i:i + 1], c[s + 'foot'][i:i + 1]
    x, a0, r = sag(th)
    th2 = unsag(x, np.array([a]), r)
    ta, tang = turn_between(th, th2)
    return th2[0], rot(sh, ta, tang)[0], rot(ft, ta, tang)[0]
def foot_up(ft):
    up = np.cross(ft, np.array([1.0, 0, 0])); up = up / max(np.linalg.norm(up), 1e-9)
    return up if up[1] >= 0 or abs(ft[1]) > 0.9 else -up
def ball_rel(c, s, i, th, sh, ft):
    # the ball of the foot: ahead of the ankle along the foot, and below it
    sg = 1 if s == 'L' else -1
    hip = c['pel_left'][i] * HIP * sg - c['pel_up'][i] * HIP_DROP
    return hip + th * L1 + sh * L2 + ft * SOLE_BALL[0] + foot_up(ft) * SOLE_BALL[1]
# The sole's two ends relative to the ankle, in the foot's frame (ahead, up): this figure's ball
# (its toe joint) and the bottom of its heel.
SOLE_BALL = (0.127, -0.063)
SOLE_HEEL = (-0.05, -0.08)
def ground_need(c, s, i, th, sh, ft):
    # the root's height that puts the lower of heel and ball on the ground
    sg = 1 if s == 'L' else -1
    an = c['pel_left'][i] * HIP * sg - c['pel_up'][i] * HIP_DROP + th * L1 + sh * L2
    up = np.cross(ft, np.array([1.0, 0, 0])); up = up / max(np.linalg.norm(up), 1e-9)
    if up[1] < 0: up = -up
    low = min((an + ft * a + up * b)[1] for a, b in (SOLE_BALL, SOLE_HEEL))
    return 0.006 - low
# The leg's longest in support: the knee never quite straight (runners' least bend is 8-10
# degrees, at touchdown and toe-off); past it the foot leaves the ground a moment early.
STRAIGHT = math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * math.cos(math.radians(8.0)))
def solve_leg(hip, ankle_target, th0, sh0, reach=(0.0, 9.0)):
    # two-bone IK: the thigh and shank that put the ankle at ankle_target from hip, the knee bending
    # in the plane the leg already bends in (forward)
    d = ankle_target - hip; dist = np.linalg.norm(d)
    dist = min(max(dist, abs(L1 - L2) + 1e-4, reach[0]), L1 + L2 - 1e-4, reach[1]); dn = d / max(np.linalg.norm(d), 1e-9)
    knee_way = np.cross(np.cross(th0, sh0), dn)
    if np.linalg.norm(knee_way) < 1e-6: knee_way = np.array([0, 0, 1.0])
    knee_way = knee_way - dn * (knee_way @ dn); knee_way /= np.linalg.norm(knee_way)
    if knee_way[2] < 0: knee_way = -knee_way
    ca = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist); sa = math.sqrt(max(1 - ca * ca, 0))
    knee = hip + L1 * (dn * ca + knee_way * sa)
    th = (knee - hip) / L1; sh = hip + dn * dist - knee; sh /= np.linalg.norm(sh)
    return th, sh
def surge(c, A):
    # The root's forward offset from steady speed over a cycle: slowed in each support by up to A of
    # its speed (braking, then pushing on), quicker in flight, the same on the whole.
    e = c['events']; ph = np.linspace(0, 1, N); f = np.zeros(N)
    for on, off in ((0.0, e[1]), (e[2], e[3])):
        m = (ph >= on) & (ph < off); f[m] = -A * np.sin(np.pi * (ph[m] - on) / (off - on))
    f[f == 0] = -f.sum() / max((f == 0).sum(), 1)
    z = np.cumsum(f) / (N - 1) * c['T']
    return z - z.mean()
def settle_at(c, v, dy, A=0.0):
    keyed = c
    # Feet that stay where they land. The root's height is as measured (the mean hip height, scaled to
    # this figure's legs); while a foot is down, its ball stays at one spot on the ground and the leg
    # is solved to it; between, in flight, as measured.
    c = dict(c)
    for k in ('Lthigh', 'Rthigh', 'Lshank', 'Rshank', 'Lfoot', 'Rfoot'): c[k] = c[k].copy()
    e = c['events']; T = c['T']; ph = np.linspace(0, 1, N)
    y = c['hip_y'] * (L1 + L2) / c['leg']
    # (its level: such that, at each touchdown, the leg as measured just reaches the ground)
    tds = []
    for s, on in (('R', 0), ('L', int(round(e[2] * (N - 1))))):
        th, sh, ft = c[s + 'thigh'][on], c[s + 'shank'][on], c[s + 'foot'][on]
        tds.append(ground_need(c, s, on, th, sh, ft) - y[on])
    y = y + np.mean(tds) + dy
    # Above the data's speeds the measured curve is a 4.5 m/s jogger's. There the hips go as a body
    # bouncing on a spring-like leg does (the sine-wave model of Morin et al. 2005): the ground's
    # push a half sine through each support, gravity alone in flight, the two averaging to the
    # body's weight. Its level: the keyed leg just reaching the ground at touchdown.
    f = np.clip((v - 4.5) / 5.0, 0, 1)
    if f > 0:
        g = 9.81; ts = e[1] * T; tf = (e[2] - e[1]) * T; w = math.pi / ts
        fm = g * math.pi * (ts + tf) / (2 * ts); v0 = -g * tf / 2
        def bounce(t):
            if t < ts: return v0 * t + fm / w * (t - math.sin(w * t) / w) - g * t * t / 2
            yo = v0 * ts + fm / w * ts - g * ts * ts / 2; vo = v0 + 2 * fm / w - g * ts; u = t - ts
            return yo + vo * u - g * u * u / 2
        geo = np.array([bounce((p - (0 if p < e[2] else e[2])) * T) for p in ph])
        tds = [ground_need(c, s, on, c[s + 'thigh'][on], c[s + 'shank'][on], c[s + 'foot'][on]) - geo[on]
               for s, on in (('R', 0), ('L', int(round(e[2] * (N - 1)))))]
        y = y * (1 - f) + (geo + np.mean(tds) + dy) * f
    zs = v * surge(c, A)
    spread = []
    for s, (on, off) in (('R', (0.0, e[1])), ('L', (e[2], e[3]))):
        idx = [i for i in range(N) if on <= ph[i] < off]
        if not idx: continue
        sg = 1 if s == 'L' else -1
        # The foot rocks: on its heel until it is flat, then on its ball, the toes lying flat as the
        # heel comes up. The averaged angles nearly keep it still (8-13 cm of slide a stance); the
        # leg is solved to take out the rest. The spot it rocks on is where the angles, as
        # measured, put it on the whole, so that the solve changes them least.
        t = (ph[idx] - ph[idx[0]]) * T + (zs[idx] - zs[idx[0]]) / max(v, 1e-6)
        # (the leg made at most 1 mm longer or 3 cm shorter than measured: past that the foot gives,
        # which it does at touchdown and toe-off, lightly loaded)
        # (at sprint speeds the keys are the literature's few numbers, not a measured leg: freer)
        fs = float(np.clip((v - 4.5) / 5.0, 0, 1))
        reach = [np.linalg.norm(c[s + 'thigh'][i] * L1 + c[s + 'shank'][i] * L2) for i in idx]
        ankle_bend = [np.arccos(np.clip(-c[s + 'shank'][i] @ c[s + 'foot'][i], -1, 1)) for i in idx]
        def parts(i):
            ft = c[s + 'foot'][i]; up = foot_up(ft)
            hip = c['pel_left'][i] * HIP * sg - c['pel_up'][i] * HIP_DROP + np.array([0, y[i], 0])
            return ft, hip, ft * SOLE_BALL[0] + up * SOLE_BALL[1], ft * SOLE_HEEL[0] + up * SOLE_HEEL[1]
        on_heel = []
        for i in idx:
            ft, hip, bo, ho = parts(i); on_heel.append(ho[1] < bo[1])
        # (once on its ball it stays there)
        flat = next((j for j in range(len(idx)) if not on_heel[j]), len(idx))
        # (sprinters land on the ball and stay there)
        if v > 6.5: flat = 0
        flat_len = SOLE_BALL[0] - SOLE_HEEL[0]
        where = []
        for j, i in enumerate(idx):
            ft, hip, bo, ho = parts(i)
            an = hip + c[s + 'thigh'][i] * L1 + c[s + 'shank'][i] * L2
            # where the heel would be, flat, for this frame's contact, in the ground's frame
            z = (an + ho)[2] if j < flat else (an + bo)[2] - flat_len
            where.append(z + v * t[j])
        spot = float(np.mean(where))
        # At sprint speeds, where the literature puts it: the ball landing some 0.3 m ahead of the
        # hips (touchdown distances of fast sprinters run 0.25-0.35 m; the keys alone fall short)
        fs = float(np.clip((v - 4.5) / 5.0, 0, 1))
        if fs > 0 and flat == 0:
            spot = spot * (1 - fs) + (0.30 * (L1 + L2) / 0.89 - flat_len) * fs
        spread.append(np.std(where))
        for j, i in enumerate(idx):
          for _ in range(4):
            ft, hip, bo, ho = parts(i)
            if j < flat:
                ankle_z, ankle_y = spot - v * t[j] - ho[2], 0.006 - ho[1]
            else:
                # (the ball rises once the foot is steep enough that the toes bend under it, flat on
                # the ground, about 5 cm long)
                lift = 0.1 * max(-ft[1] - 0.5, 0.0)
                ankle_z, ankle_y = spot + flat_len - v * t[j] - bo[2], 0.006 + lift - bo[1]
            ankle = np.array([(hip + c[s + 'thigh'][i] * L1 + c[s + 'shank'][i] * L2)[0], ankle_y, ankle_z])
            th, sh = solve_leg(hip, ankle, c[s + 'thigh'][i], c[s + 'shank'][i], (reach[j] - 0.03 - 0.12 * fs, min(reach[j] + 0.001 + 0.04 * fs, STRAIGHT)))
            c[s + 'thigh'][i], c[s + 'shank'][i] = th, sh
            # the foot turned with the shank, about the leg's own left
            left = np.cross(-sh, ft); left = left / max(np.linalg.norm(left), 1e-9)
            if left[0] < 0: left = -left
            c[s + 'foot'][i] = rot(-sh[None, :], left[None, :], np.array([ankle_bend[j]]))[0]
    # The solved support meets the keyed swing without a jump: the difference at toe-off fades out
    # over the next tenth of a cycle, and the one at touchdown in over the tenth before it.
    for s, (on, off) in (('R', (0.0, e[1])), ('L', (e[2], e[3]))):
        idx = [i for i in range(N) if on <= ph[i] < off]
        if not idx: continue
        a, b = idx[0], idx[-1]; span = 10
        for k in ('thigh', 'shank', 'foot'):
            key = s + k; d_off = c[key][b] - keyed[key][b]; d_on = c[key][a] - keyed[key][a]
            for n in range(1, span + 1):
                w = 0.5 + 0.5 * math.cos(math.pi * n / span)
                i = (b + n) % N
                if i not in idx: c[key][i] = unit(c[key][i] + d_off * w)
                i = (a - n) % N
                if i not in idx: c[key][i] = unit(c[key][i] + d_on * w)
    c['root_y'] = y; c['root_dz'] = zs; c['spread'] = float(np.mean(spread))
    return c
def knees(c):
    return np.array([math.degrees(math.acos(np.clip(c[s + 'thigh'][i] @ c[s + 'shank'][i], -1, 1))) for s in 'LR' for i in range(N)])
def settle(c, v):
    # The hips' level: the one at which the solve changes the knees' measured bends least (levelled
    # at touchdown alone, the leg can be short of the ground later in support and straighten).
    k0 = knees(c)
    # How much it slows in support: what the measured legs' sweep asks, up to the 8% or so that
    # the body's forward speed is measured to dip by (Cavagna et al.).
    A = min(np.arange(0.0, 0.085, 0.01), key=lambda a: settle_at(c, v, 0.0, a)['spread'])
    if v <= 6.5:
        best = min(np.arange(-0.08, 0.03, 0.005), key=lambda dy: np.sum((knees(settle_at(c, v, dy, A)) - k0) ** 2))
    else:
        # (faster: the knee bent as the foot lands from a jogger's 12 degrees to a sprinter's 25)
        want = 12.0 + 13.0 * np.clip((v - 4.5) / 5.0, 0, 1)
        on = [N + 0, int(round(c['events'][2] * (N - 1)))]
        best = min(np.arange(-0.12, 0.03, 0.005), key=lambda dy: np.sum((knees(settle_at(c, v, dy, A))[on] - want) ** 2))
    out = settle_at(c, v, best, A); out['A'] = round(float(A), 2)
    return out

if __name__ == '__main__':
    import pickle
    legs, up = pickle.load(open('/tmp/chr/gen/means.pkl', 'rb'))
    out = [HEADER]
    for v in (2.5, 3.5, 4.5, 6.0, 7.5, 9.0, 10.0):
        out += steady(f"run_{int(v * 10):03d}", v, legs, up) + [""]
    out += burst("burst", legs, up) + [""]
    open(sys.argv[1], 'w').write("\n".join(out) + "\n")
    print('wrote', sys.argv[1])

