# stats.py: the yardsticks, all planes, for a set of running cycles (dicts as rbds.cycles makes).
import numpy as np
def deg(a): return np.degrees(a)
def metrics(c):
    m = {}
    m['steps/s'] = 2 / c['T']
    m['duty'] = (c['downR'].mean() + c['downL'].mean()) / 2
    for s, sg in (('R', -1), ('L', 1)):
        th, sh, ft = c[s + 'thigh'], c[s + 'shank'], c[s + 'foot']
        sag = deg(np.arctan2(th[:, 2], -th[:, 1]))
        m[s + 'thigh_fwd_max'] = sag.max(); m[s + 'thigh_back_max'] = -sag.min()
        knee = deg(np.arccos(np.clip((th * sh).sum(1), -1, 1)))
        dn = c['down' + s]
        m[s + 'knee_swing_max'] = knee.max(); m[s + 'knee_stance_max'] = knee[dn].max() if dn.any() else np.nan
        on = np.argmax(dn)
        m[s + 'knee_at_contact'] = knee[on]
        # frontal: thigh out from vertical (+ = abducted, foot outward), at mid stance
        mid = np.where(dn)[0]; mid = mid[len(mid) // 2] if len(mid) else 0
        m[s + 'thigh_out_midstance'] = deg(np.arctan2(th[mid, 0] * sg * -1, -th[mid, 1])) if False else deg(np.arctan2(-sg * th[mid, 0] * -1, -th[mid, 1]))
        # knee in from the hip-ankle line (frontal, m, + = toward the middle), mid stance
        L = c['leg'] / 2
        knee_p = th[mid] * L; ank = knee_p + sh[mid] * L
        line_x = ank[0] * (knee_p[1] / ank[1])
        m[s + 'knee_in_cm'] = (knee_p[0] - line_x) * (1 if s == 'R' else -1) * 100
        m[s + 'land_across_cm'] = c[s + 'ankle_x'][dn].mean() * (-1 if s == 'R' else 1) * 100
        # foot progression (+ toes out), mid stance
        m[s + 'toe_out'] = deg(np.arctan2(-sg * ft[mid, 0] * -1, ft[mid, 2])) if False else deg(np.arctan2(ft[mid, 0] * (1 if s == 'L' else -1), ft[mid, 2]))
        m[s + 'foot_pitch_contact'] = deg(np.arcsin(np.clip(ft[on, 1], -1, 1)))
    pl, pu = c['pel_left'], c['pel_up']
    m['pelvis_tilt_mean'] = deg(np.arctan2(pu[:, 2], pu[:, 1])).mean()
    m['pelvis_tilt_range'] = np.ptp(deg(np.arctan2(pu[:, 2], pu[:, 1])))
    m['pelvis_obliquity_range'] = np.ptp(deg(np.arcsin(np.clip(pl[:, 1], -1, 1))))
    m['pelvis_rotation_range'] = np.ptp(deg(np.arctan2(pl[:, 2], pl[:, 0])))
    m['hip_bounce_cm'] = np.ptp(c['hip_y']) * 100
    m['hip_sway_cm'] = np.ptp(c['hip_x']) * 100
    return m
def summary(cycs, label):
    ms = [metrics(c) for c in cycs]
    keys = ms[0].keys()
    def both(k): return k[1:] if k[0] in 'RL' else k
    seen = []; rows = []
    for k in keys:
        b = both(k)
        if b in seen: continue
        seen.append(b)
        vals = [m[k2] for m in ms for k2 in (('R' + b, 'L' + b) if k[0] in 'RL' else (k,))]
        vals = np.array(vals, float); vals = vals[~np.isnan(vals)]
        rows.append(f"  {b:22s} {np.mean(vals):7.1f}  (sd {np.std(vals):5.1f})")
    print(f"== {label}: {len(cycs)} cycles"); print('\n'.join(rows))
