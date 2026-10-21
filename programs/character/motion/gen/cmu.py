# cmu.py: running cycles (left foot down to left foot down) from CMU motion capture trials, the whole
# body, in the run's frame (x left, y up, z the way he goes), each frame's turn from the subject's rest
# pose (so standing upright reads as upright).
import sys, numpy as np, math
sys.path.insert(0, '/tmp/chr/tools')
import amc
FPS = 120.0
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)
def mirror(c):
    # a right-foot cycle as if it were a left one: sides swapped, x reflected
    m = {}
    sw = lambda k: ('R' + k[1:] if k[0] == 'L' else 'L' + k[1:]) if k[0] in 'LR' and k[1:2].islower() else k
    for k, v in c.items():
        k2 = sw(k)
        if k.startswith('down'): k2 = 'down' + ('L' if k[-1] == 'R' else 'R')
        if isinstance(v, np.ndarray) and v.ndim == 2:
            w = v * np.array([-1.0, 1, 1])
            if k.endswith('_left'): w = -w
            m[k2] = w
        elif k.endswith('ankle_x') or k == 'hip_x':
            m[k2] = -v
        else:
            m[k2] = v
    return m
def cycles(trial, min_speed=1.5):
    s = trial.split('_')[0]; d = '/tmp/chr/mocap/'
    bones, order, hier = amc.read_asf(d + s + '.asf')
    frames = amc.read_amc(d + trial + '.amc')
    PR = [amc.pose(bones, order, hier, fr) for fr in frames]
    zero = {'root': [0.0] * 6}
    for b in bones: zero[b] = [0.0] * len(bones[b]['dof'])
    R0 = amc.pose(bones, order, hier, zero)[1]
    X, Y, Z = np.eye(3)
    ax = lambda b, v: np.array([x[1][b] @ R0[b].T @ v for x in PR])
    P = lambda b: np.array([x[0][b] for x in PR])
    root = P('root'); n = len(root)
    k = 12
    vel = np.zeros_like(root); vel[k:-k] = (root[2 * k:] - root[:-2 * k]) / (2 * k / FPS); vel[:k] = vel[k]; vel[-k:] = vel[-k - 1]
    vel[:, 1] = 0; speed = np.linalg.norm(vel, axis=1); fwd = unit(vel)
    left = np.cross([0, 1.0, 0], fwd)
    ball = {'L': P('lfoot'), 'R': P('rfoot')}; toe = {'L': P('ltoes'), 'R': P('rtoes')}
    ground = min(toe['L'][:, 1].min(), toe['R'][:, 1].min())
    down = {}
    for sd in 'LR':
        lowy = np.minimum(toe[sd][:, 1], ball[sd][:, 1]); fl = np.percentile(lowy, 5)
        v = np.zeros(n); v[1:] = np.linalg.norm(ball[sd][1:] - ball[sd][:-1], axis=1) * FPS
        v = np.convolve(v, np.ones(5) / 5, 'same'); down[sd] = ((lowy - fl) < 0.06) & (v < 1.0)
    D = {'pel_left': ax('root', X), 'pel_up': ax('root', Y), 'chest_left': ax('thorax', X), 'chest_up': ax('thorax', Y),
         'head_left': ax('head', X), 'head_nose': ax('head', Z),
         'Luparm': unit(P('lhumerus') - P('lclavicle')), 'Lforearm': unit(P('lradius') - P('lhumerus')),
         'Ruparm': unit(P('rhumerus') - P('rclavicle')), 'Rforearm': unit(P('rradius') - P('rhumerus')),
         'Lthigh': unit(P('lfemur') - P('lhipjoint')), 'Lshank': unit(P('ltibia') - P('lfemur')),
         'Rthigh': unit(P('rfemur') - P('rhipjoint')), 'Rshank': unit(P('rtibia') - P('rfemur')),
         'Lfoot': ax('lfoot', Z), 'Rfoot': ax('rfoot', Z)}
    hipc = (P('lhipjoint') + P('rhipjoint')) / 2
    out = []
    for first in 'LR':
      ls = [i for i in range(1, n) if down[first][i] and not down[first][i - 1]]
      for a, b in zip(ls, ls[1:]):
          if not (0.4 * FPS < b - a < 1.2 * FPS) or speed[a:b].mean() < min_speed: continue
          idx = np.linspace(a, b, 101); c = {}
          F = fwd[(a + b) // 2]; Lf = left[(a + b) // 2]
          for key, v in D.items():
              w = np.stack([np.interp(idx, np.arange(n), v[:, j]) for j in range(3)], 1)
              c[key] = np.stack([w @ Lf, w[:, 1], w @ F], 1)
          h = np.stack([np.interp(idx, np.arange(n), hipc[:, j]) for j in range(3)], 1)
          c['hip_y'] = (h[:, 1] - h[:, 1].mean()) * amc.SCALE / amc.SCALE
          c['hip_x'] = h @ Lf - (h @ Lf).mean()
          for sd in 'LR': c['down' + sd] = np.interp(idx, np.arange(n), down[sd].astype(float)) > 0.5
          c['T'] = (b - a) / FPS; c['speed'] = speed[a:b].mean()
          lh = amc.read_asf(d + s + '.asf')[0]; c['leg'] = (lh['lfemur']['len'] + lh['ltibia']['len']) * amc.SCALE
          an = {sd: np.stack([np.interp(idx, np.arange(n), P(('l' if sd == 'L' else 'r') + 'tibia')[:, j]) for j in range(3)], 1) for sd in 'LR'}
          for sd in 'LR': c[sd + 'ankle_x'] = (an[sd] - h) @ Lf
          if first == 'R': c = mirror(c)
          out.append(c)
    return out
if __name__ == '__main__':
    for t in sys.argv[1:]:
        cs = cycles(t)
        print(t, len(cs), 'cycles', np.mean([c['speed'] for c in cs]).round(2) if cs else '')
