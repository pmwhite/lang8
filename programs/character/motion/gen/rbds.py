# rbds.py: the running cycle of one runner, from the Fukuchi running dataset (RBDS, figshare
# 10.6084/m9.figshare.4543435, CC BY 4.0): treadmill running at 2.5, 3.5, 4.5 m/s, raw 3D markers.
# Joint centres are found the standard way (clusters fixed in the static trial carry the anatomical
# landmarks into each running frame; hip centres by Harrington's regression from the pelvis).
# Out: per stride (right foot down to right foot down), on 101 points, the directions a figure needs.
import numpy as np, sys
def load(path):
    lines = open(path).read().split('\n')
    head = lines[0].split('\t')
    data = np.array([[float(v) if v not in ('', 'NaN') else np.nan for v in l.split('\t')] for l in lines[1:] if l.strip()])
    cols = {}
    for i, h in enumerate(head):
        if h == 'Time': continue
        cols.setdefault(h[:-1], [None, None, None])['XYZ'.index(h[-1])] = i
    return {k: data[:, v] for k, v in cols.items()}, data[:, head.index('Time')]
def unit(v): return v / np.linalg.norm(v, axis=-1, keepdims=True)
def kabsch(P, Q):
    # rotation R, translation t with Q ~ R P + t (P, Q: n x 3), per frame Q (f x n x 3)
    pc = P.mean(0); qc = Q.mean(1)
    H = np.einsum('ni,fnj->fij', P - pc, Q - qc[:, None])
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(np.einsum('fij,fjk->fik', Vt.transpose(0, 2, 1), U.transpose(0, 2, 1))))
    D = np.repeat(np.eye(3)[None], len(Q), 0); D[:, 2, 2] = d
    R = np.einsum('fij,fjk,fkl->fil', Vt.transpose(0, 2, 1), D, U.transpose(0, 2, 1))
    t = qc - np.einsum('fij,j->fi', R, pc)
    return R, t
CL = {
 'pelvis': ['R.ASIS', 'L.ASIS', 'R.PSIS', 'L.PSIS', 'R.Iliac.Crest', 'L.Iliac.Crest'],
 'Rthigh': ['R.Thigh.Top.Lateral', 'R.Thigh.Top.Medial', 'R.Thigh.Bottom.Lateral', 'R.Thigh.Bottom.Medial'],
 'Lthigh': ['L.Thigh.Top.Lateral', 'L.Thigh.Top.Medial', 'L.Thigh.Bottom.Lateral', 'L.Thigh.Bottom.Medial'],
 'Rshank': ['R.Shank.Top.Lateral', 'R.Shank.Top.Medial', 'R.Shank.Bottom.Lateral', 'R.Shank.Bottom.Medial'],
 'Lshank': ['L.Shank.Top.Lateral', 'L.Shank.Top.Medial', 'L.Shank.Bottom.Lateral', 'L.Shank.Bottom.Medial'],
 'Rfoot': ['R.Heel.Top', 'R.Heel.Bottom', 'R.Heel.Lateral', 'R.MT1', 'R.MT5'],
 'Lfoot': ['L.Heel.Top', 'L.Heel.Bottom', 'L.Heel.Lateral', 'L.MT1', 'L.MT5'],
}
def subject(sid, speed):
    S, _ = load(f'/tmp/chr/rbds/RBDS{sid:03d}static.txt')
    M, time = load(f'/tmp/chr/rbds/RBDS{sid:03d}runT{speed}markers.txt')
    st = {k: np.nanmean(v, 0) for k, v in S.items()}
    # Lab: y up; forward is the way the pelvis faces (PSIS to ASIS), in the static trial.
    fwd0 = (st['R.ASIS'] + st['L.ASIS'] - st['R.PSIS'] - st['L.PSIS']) / 2; fwd0[1] = 0; fwd0 = unit(fwd0)
    up = np.array([0, 1.0, 0]); left0 = np.cross(up, fwd0)
    # landmarks in static
    pw = np.linalg.norm(st['L.ASIS'] - st['R.ASIS']); pd = np.linalg.norm((st['L.ASIS'] + st['R.ASIS'] - st['L.PSIS'] - st['R.PSIS']) / 2)
    mid = (st['L.ASIS'] + st['R.ASIS']) / 2
    pl = unit(st['L.ASIS'] - st['R.ASIS']); pf = unit(mid - (st['L.PSIS'] + st['R.PSIS']) / 2); pf = unit(pf - pl * (pf @ pl)); pu = np.cross(pf, pl)
    hjc = {s: mid + pf * (-0.24 * pd - 9.9) + pu * (-0.30 * pw - 10.9) + pl * sgn * (0.33 * pw + 7.3) for s, sgn in (('L', 1), ('R', -1))}
    land = {}
    for s in 'LR':
        land[s + 'hip'] = ('pelvis', hjc[s])
        land[s + 'knee'] = (s + 'thigh', (st[s + '.Knee'] + st[s + '.Knee.Medial']) / 2)
        land[s + 'ankle'] = (s + 'shank', (st[s + '.Ankle'] + st[s + '.Ankle.Medial']) / 2)
        land[s + 'toe'] = (s + 'foot', st[s + '.MT2'])
        land[s + 'heel'] = (s + 'foot', st[s + '.Heel.Bottom'])
    # standing pose of each cluster
    out = {}; R_of = {}
    for name, mk in CL.items():
        P = np.array([st[m] for m in mk]); Q = np.stack([M[m] for m in mk], 1)
        ok = ~np.isnan(Q).any(axis=(1, 2))
        R = np.full((len(Q), 3, 3), np.nan); t = np.full((len(Q), 3), np.nan)
        R[ok], t[ok] = kabsch(P, Q[ok])
        R_of[name] = (R, t)
    for k, (cl, p) in land.items():
        R, t = R_of[cl]; out[k] = np.einsum('fij,j->fi', R, p) + t
    # Directions as a figure wants them: the pelvis's left and up turned from standing (so standing
    # is upright), thigh hip->knee, shank knee->ankle, foot heel->toe turned from standing level.
    Rp = R_of['pelvis'][0]
    pel_left = np.einsum('fij,j->fi', Rp, left0); pel_up = np.einsum('fij,j->fi', Rp, up)
    def footdir(s):
        h0 = st[s + '.MT2'] - st[s + '.Heel.Bottom']; lev = h0.copy(); lev[1] = 0; lev = unit(lev)
        # the turn from the standing foot, applied to its level heel->toe
        return np.einsum('fij,j->fi', R_of[s + 'foot'][0], lev)
    D = {'pel_left': pel_left, 'pel_up': pel_up}
    for s in 'LR':
        D[s + 'thigh'] = unit(out[s + 'knee'] - out[s + 'hip']); D[s + 'shank'] = unit(out[s + 'ankle'] - out[s + 'knee'])
        D[s + 'foot'] = footdir(s)
    hipc = (out['Lhip'] + out['Rhip']) / 2
    # Foot down: the treadmill's force plate bears weight (over 50 N), on the lower foot. (The
    # plate's centre of pressure is in its own frame, offset from the markers'.)
    fs = 1 / np.nanmedian(np.diff(time))
    F = np.array([[float(v) for v in l.split('\t')] for l in open(f'/tmp/chr/rbds/RBDS{sid:03d}runT{speed}forces.txt').read().split('\n')[1:] if l.strip()])
    k = len(F) / len(time)
    fy = np.interp(np.arange(len(time)) * k, np.arange(len(F)), F[:, 2])
    loaded = fy > 50
    low = {s: np.minimum(out[s + 'heel'][:, 1], out[s + 'toe'][:, 1]) for s in 'LR'}
    lowL = np.nan_to_num(low['L'], nan=1e9) < np.nan_to_num(low['R'], nan=1e9)
    down = {'L': loaded & lowL, 'R': loaded & ~lowL}
    leg = np.nanmean(np.linalg.norm(out['Lknee'] - out['Lhip'], axis=1) + np.linalg.norm(out['Lankle'] - out['Lknee'], axis=1)) / 1000
    return D, hipc / 1000, down, fs, fwd0, left0, leg, out
def cycles(sid, speed):
    D, hipc, down, fs, fwd0, left0, leg, out = subject(sid, speed)
    rs = [i for i in range(1, len(down['R'])) if down['R'][i] and not down['R'][i - 1]]
    res = []
    for a, b in zip(rs, rs[1:]):
        if not (0.45 * fs < b - a < 1.0 * fs): continue
        idx = np.linspace(a, b, 101)
        cyc = {}
        bad = False
        for k, v in D.items():
            w = np.stack([np.interp(idx, np.arange(len(v)), v[:, j]) for j in range(3)], 1)
            if np.isnan(w).any(): bad = True
            # to the frame of the run: x left, y up, z forward
            cyc[k] = np.stack([w @ left0, w[:, 1], w @ fwd0], 1)
        if bad: continue
        h = np.stack([np.interp(idx, np.arange(len(hipc)), hipc[:, j]) for j in range(3)], 1)
        cyc['hip_y'] = h[:, 1] - h[:, 1].mean(); cyc['hip_x'] = h @ left0 - (h @ left0).mean()
        cyc['downR'] = np.interp(idx, np.arange(len(down['R'])), down['R'].astype(float)) > 0.5
        cyc['downL'] = np.interp(idx, np.arange(len(down['L'])), down['L'].astype(float)) > 0.5
        cyc['T'] = (b - a) / fs; cyc['leg'] = leg
        # where each ankle is, across, from the middle of the hips (m)
        for s in 'LR':
            an = np.stack([np.interp(idx, np.arange(len(v)), out[s + 'ankle'][:, j]) for j in range(3)], 1) / 1000
            cyc[s + 'ankle_x'] = (an - h / 1) @ left0
        res.append(cyc)
    return res
if __name__ == '__main__':
    sid, speed = int(sys.argv[1]), sys.argv[2]
    cs = cycles(sid, speed)
    print(len(cs), 'strides; stride time', np.mean([c['T'] for c in cs]).round(3), 'leg', cs[0]['leg'].round(3))
    c = cs[0]
    print('duty R', c['downR'].mean().round(2), 'L', c['downL'].mean().round(2))
    print('R thigh fwd angle min/max', np.degrees(np.arctan2(c['Rthigh'][:, 2], -c['Rthigh'][:, 1])).min().round(0), np.degrees(np.arctan2(c['Rthigh'][:, 2], -c['Rthigh'][:, 1])).max().round(0))
    print('pelvis up lean fwd mean', np.degrees(np.arctan2(c['pel_up'][:, 2], c['pel_up'][:, 1])).mean().round(1))
    print('R ankle across at R contact (m from middle, + left)', c['Rankle_x'][c['downR']].mean().round(3), ' L', c['Lankle_x'][c['downL']].mean().round(3))
