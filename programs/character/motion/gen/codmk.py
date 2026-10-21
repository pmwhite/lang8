# Marker view of the V-cuts: which way the trunk leans and the pelvis turns at the plant, relative
# to which way he cuts, and where the plant foot is.
import sys, math, numpy as np
sys.path.insert(0, '/tmp/chr/gen'); import cod
def trc(path):
    L = open(path).read().split('\n')
    names = L[3].split('\t')[2:]
    names = [n for n in names if n.strip()]
    rows = [[float(x) for x in l.split('\t') if x.strip()] for l in L[5:] if l.strip()]
    rows = [r for r in rows if len(r) == 2 + 3 * len(names)]
    a = np.array(rows); t = a[:, 1]
    return t, {n: a[:, 2 + 3 * k:5 + 3 * k] / 1000 for k, n in enumerate(names)}
def flat(v): return np.array([v[0], v[2]])
def left_of(d): return np.array([d[1], -d[0]])   # lab X, Z with Y up: left of heading (right-handed)
out = []
for kind in ('vcut', 'curvedslowrunning'):
  for cf, gf in cod.trials(kind):
    t, M = trc(cf.replace('_inverse_methods_coordinates.mot', '_measured_markers.trc'))
    G = cod.table(gf)
    sac = M['Sacr']; c7 = M['C7']
    for (a, b, side, i, j) in sorted(cod.stances(G, 'r') + cod.stances(G, 'l')):
        if a < t[0] + 0.1 or b > t[-1] - 0.1: continue
        def P(tt, m): return np.array([np.interp(tt, t, M[m][:, k]) for k in range(3)])
        h_in = flat(P(a, 'Sacr') - P(a - 0.1, 'Sacr')); v_in = np.linalg.norm(h_in) / 0.1; h_in /= np.linalg.norm(h_in)
        h_out = flat(P(b + 0.1, 'Sacr') - P(b, 'Sacr')); v_out = np.linalg.norm(h_out) / 0.1; h_out /= np.linalg.norm(h_out)
        turn = math.degrees(math.atan2(h_out @ left_of(h_in), h_out @ h_in))
        if kind == 'vcut' and abs(turn) < 30: continue
        s = 1 if turn > 0 else -1     # +1: cut to his left
        mid = (a + b) / 2
        trunk = P(mid, 'C7') - P(mid, 'Sacr')
        lean_lat = math.degrees(math.atan2(flat(trunk) @ left_of(h_in) * s, trunk[1]))
        lean_fwd = math.degrees(math.atan2(flat(trunk) @ h_in, trunk[1]))
        pel = flat(P(mid, 'LAsi') - P(mid, 'RAsi')); pel /= np.linalg.norm(pel)   # pelvis's left
        pel_fwd = np.array([-pel[1], pel[0]])  # its forward (left turned right a quarter)
        yaw = math.degrees(math.atan2(pel_fwd @ left_of(h_in), pel_fwd @ h_in)) * s
        sh = flat(P(mid, 'LSho') - P(mid, 'RSho')); sh /= np.linalg.norm(sh); sh_fwd = np.array([-sh[1], sh[0]])
        syaw = math.degrees(math.atan2(sh_fwd @ left_of(h_in), sh_fwd @ h_in)) * s
        p = '' if side == 'r' else 'l_'
        k = slice(i, j); fy = G[p + 'ground_force_vy'][k]
        cop = np.array([np.average(G[p + 'ground_force_px'][k], weights=fy), np.average(G[p + 'ground_force_pz'][k], weights=fy)])
        off = cop - flat(P(a, 'Sacr'))
        foot_side = (1 if side == 'l' else -1) * s   # +1: the foot on the side he cuts to
        # whole-body line: sacrum over the cop, lateral, at mid-stance
        body = flat(P(mid, 'Sacr')) - cop
        body_lean = math.degrees(math.atan2(body @ left_of(h_in) * s, P(mid, 'Sacr')[1]))
        hip_y = [np.interp(x, t, M['Sacr'][:, 1]) for x in np.linspace(a, b, 20)]
        out.append((kind, turn, foot_side))
        print(f"{kind[:5]} {side} turn {turn:+4.0f} {'inside' if foot_side > 0 else 'outside'} foot  v {v_in:.1f}->{v_out:.1f} contact {b-a:.2f}  cop ahead {off @ h_in:+.2f} out {-(off @ left_of(h_in)) * s:+.2f}  pelvis turned {yaw:+.0f} shoulders {syaw:+.0f}  trunk lean toward cut {lean_lat:+.0f} fwd {lean_fwd:+.0f}  body line toward cut {body_lean:+.0f}  sacrum drop {(hip_y[0]-min(hip_y))*100:.0f} cm")
