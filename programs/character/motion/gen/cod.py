# Change-of-direction trials of Nitschke et al. 2022 (Zenodo 6949012, CC BY 4.0): what each
# V-cut, curved run, and straight run does, step by step.
import sys, os, glob, math, numpy as np
ROOT = '/tmp/chr/cod/data'
def table(path):
    lines = open(path).read().split('\n')
    i = next(k for k, l in enumerate(lines) if l.strip() == 'endheader')
    while lines[i + 1].strip() == 'endheader' or not lines[i + 1].strip(): i += 1
    head = lines[i + 1].split('\t')
    rows = [[float(x) for x in l.split('\t') if x.strip()] for l in lines[i + 2:] if l.strip()]
    a = np.array(rows)
    return {h.strip(): a[:, k] for k, h in enumerate(head)}
def trials(kind):
    for d in sorted(glob.glob(f'{ROOT}/Participant_*/{kind}')):
        for f in sorted(glob.glob(f'{d}/*_inverse_methods_coordinates.mot')):
            yield f, f.replace('_inverse_methods_coordinates.mot', '_measured_GRFs.mot')
def stances(G, side):
    p = '' if side == 'r' else 'l_'
    fy = G[p + 'ground_force_vy']; t = G['time']
    on = fy > 50
    out = []
    i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]: j += 1
            if j - i > 20: out.append((t[i], t[j - 1], side, i, j))
            i = j
        else: i += 1
    return out
def at(C, t, key):
    return np.interp(t, C['time'], C[key])
def heading(C, t0, t1):
    x0, z0 = at(C, t0, 'pelvis_tx'), at(C, t0, 'pelvis_tz'); x1, z1 = at(C, t1, 'pelvis_tx'), at(C, t1, 'pelvis_tz')
    return math.atan2(z1 - z0, x1 - x0), math.hypot(x1 - x0, z1 - z0) / (t1 - t0)
def analyse(kind, show=True):
    res = []
    for cf, gf in trials(kind):
        C = table(cf); G = table(gf)
        t0, t1 = C['time'][0], C['time'][-1]
        st = [s for s in stances(G, 'r') + stances(G, 'l') if s[1] > t0 + 0.02 and s[0] < t1 - 0.02]
        st.sort()
        rows = []
        for (a, b, side, i, j) in st:
            a2, b2 = max(a, t0), min(b, t1)
            hin, vin = heading(C, max(t0, a2 - 0.08), a2)
            hout, vout = heading(C, b2, min(t1, b2 + 0.08)) if b2 + 0.02 < t1 else (hin, vin)
            turn = math.degrees((hout - hin + math.pi) % (2 * math.pi) - math.pi)
            p = '' if side == 'r' else 'l_'
            k = slice(i, j); fy = G[p + 'ground_force_vy'][k]
            cop = np.array([np.average(G[p + 'ground_force_px'][k], weights=fy), np.average(G[p + 'ground_force_pz'][k], weights=fy)])
            pel = np.array([at(C, a2, 'pelvis_tx'), at(C, a2, 'pelvis_tz')])
            d = np.array([math.cos(hin), math.sin(hin)]); lat = np.array([-d[1], d[0]])
            off = cop - pel
            knee_td = -at(C, a, 'knee_angle_' + side); knee_pk = -min(C['knee_angle_' + side][(C['time'] >= a) & (C['time'] <= b)], default=0)
            res_row = dict(side=side, t=a, contact=b - a, vin=vin, vout=vout, turn=turn, ahead=off @ d, aside=off @ lat,
                           knee_td=knee_td, knee_pk=knee_pk, hip_add=at(C, a, 'hip_adduction_' + side), hip_flex=at(C, a, 'hip_flexion_' + side),
                           pel_rot=at(C, a + (b - a) / 2, 'pelvis_rotation'), pel_obl=at(C, a + (b - a) / 2, 'pelvis_obliquity'),
                           lum_bend=at(C, a + (b - a) / 2, 'lumbar_bending'), lum_rot=at(C, a + (b - a) / 2, 'lumbar_rotation'), lum_ext=at(C, a + (b - a) / 2, 'lumbar_extension'),
                           ty_td=at(C, a, 'pelvis_ty'), ty_min=min(C['pelvis_ty'][(C['time'] >= a) & (C['time'] <= b)], default=0),
                           complete=a >= t0 and b <= t1)
            rows.append(res_row)
        res.append((cf, rows, C))
        if show:
            print(os.path.relpath(cf, ROOT).split('_inverse')[0], f"stride {t1 - t0:.2f}s")
            for r in rows:
                print(f"  {r['side']} t {r['t']:.2f} contact {r['contact']:.3f}{'' if r['complete'] else '*'} v {r['vin']:.2f}->{r['vout']:.2f} turn {r['turn']:+5.0f}  cop ahead {r['ahead']:+.2f} aside {r['aside']:+.2f}  knee {r['knee_td']:.0f}->{r['knee_pk']:.0f} hip add {r['hip_add']:+.0f} flex {r['hip_flex']:.0f}  pelvis rot {r['pel_rot']:+.0f} obl {r['pel_obl']:+.0f}  lumbar bend {r['lum_bend']:+.0f} rot {r['lum_rot']:+.0f} ext {r['lum_ext']:+.0f}  hips {r['ty_td']:.2f}->{r['ty_min']:.2f}")
    return res
if __name__ == '__main__':
    analyse(sys.argv[1] if len(sys.argv) > 1 else 'vcut')
