# A top view of a track: his path, where each foot is put (left blue, right red, a tick for its
# heading), and which way he faces every tenth of a second.
import math, sys, numpy as np, subprocess
sys.path.insert(0, '/tmp/chr/gen'); import body as B, plan as P
def svg(track, path, title=''):
    xs = [st.spot[0] for st in track.steps] + list(track.P[:, 0]); zs = [st.spot[1] for st in track.steps] + list(track.P[:, 1])
    x0, x1, z0, z1 = min(xs) - 1, max(xs) + 1, min(zs) - 1, max(zs) + 1
    k = 700 / max(x1 - x0, z1 - z0)
    def X(x): return (x1 - x) * k + 20     # his left (+x) drawn to the left
    def Z(z): return (z1 - z) * k + 40
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{(x1-x0)*k+40:.0f}" height="{(z1-z0)*k+60:.0f}"><rect width="100%" height="100%" fill="white"/>']
    out.append(f'<text x="10" y="20" font-size="16">{title}</text>')
    for m in range(int(z0), int(z1) + 1):
        out.append(f'<line x1="0" y1="{Z(m):.0f}" x2="2000" y2="{Z(m):.0f}" stroke="#eee"/>')
    pts = ' '.join(f'{X(p[0]):.1f},{Z(p[1]):.1f}' for p in track.P[::3])
    out.append(f'<polyline points="{pts}" fill="none" stroke="black" stroke-width="1.5"/>')
    for i in range(0, len(track.T), 12):
        p = track.P[i]; f = track.PSI[i]
        out.append(f'<line x1="{X(p[0]):.1f}" y1="{Z(p[1]):.1f}" x2="{X(p[0] + 0.25 * math.sin(f)):.1f}" y2="{Z(p[1] + 0.25 * math.cos(f)):.1f}" stroke="green"/>')
    for st in track.steps:
        c = '#2266dd' if st.side == 'L' else '#dd3322'
        x, z = st.spot
        out.append(f'<circle cx="{X(x):.1f}" cy="{Z(z):.1f}" r="5" fill="{c}"/>')
        out.append(f'<line x1="{X(x):.1f}" y1="{Z(z):.1f}" x2="{X(x + 0.2 * math.sin(st.foot_yaw)):.1f}" y2="{Z(z + 0.2 * math.cos(st.foot_yaw)):.1f}" stroke="{c}" stroke-width="2"/>')
        out.append(f'<text x="{X(x)+7:.1f}" y="{Z(z)+4:.1f}" font-size="10" fill="{c}">{st.kind}</text>')
    out.append('</svg>')
    open(path + '.svg', 'w').write('\n'.join(out))
    subprocess.run(['convert', path + '.svg', path + '.png'], check=True)
def script(parts):
    def f(t):
        for secs, deg, sp in parts:
            if t < secs: return (math.radians(deg) if sp > 0 else None, sp)
            t -= secs
        return (None, 0.0)
    return f
if __name__ == '__main__':
    cases = {'cut90': ([(1.0, 0, 8.0), (2.0, 90, 8.0)], (0, 8.0)),
             'cut45': ([(1.0, 0, 7.0), (2.0, 45, 7.0)], (0, 7.0)),
             'turn180': ([(1.0, 0, 8.0), (3.0, 180, 8.0)], (0, 8.0)),
             'arc': ([(1.0, 0, 8.0), (2.0, 30, 8.0)], (0, 8.0))}
    for name in sys.argv[1:]:
        parts, v0 = cases[name]
        tr = B.Track(P.plan(script(parts), sum(p[0] for p in parts), v0))
        svg(tr, f'/tmp/chr/top_{name}', name)
