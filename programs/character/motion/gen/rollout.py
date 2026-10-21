# Follow the policy from a speed and angle, step by step, and say what each step is.
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import dp
pol_all = pickle.load(open('/tmp/chr/gen/policy.pkl', 'rb'))
def follow(s, th_deg, target, n=10, par=0):
    V, pol, ACTS = pol_all[target]
    th = math.radians(th_deg)
    for k in range(n):
        si = int(np.clip(round(s / 0.25), 0, len(dp.SGRID) - 1)); ti = int(np.clip(round(math.degrees(th) / 5), 0, len(dp.TGRID) - 1))
        a = pol[par, si, ti]
        if a < 0: print('   done'); return
        A = ACTS[si][a]
        dvx, dvz, dur, eff, y0, habit, ahead, aside, tc, tf, skew, push, y1, vy1, vy0 = A
        nx, nz = dvx, s + dvz
        ns = math.hypot(nx, nz); ang = math.atan2(nx, nz)
        nth = abs(((ang + th) + math.pi) % (2 * math.pi) - math.pi)
        kind = 'brake' if dvz < -0.5 and abs(dvx) < 0.6 else ('plant' if abs(dvx) > 1.2 else ('drive' if dvz > 0.5 else 'run'))
        print(f"   {'OI'[par]} {kind:5s} v {s:4.1f}->{ns:4.1f} off by {math.degrees(th):4.0f}->{math.degrees(nth):4.0f}  dv along {dvz:+.1f} across {dvx:+.1f}  foot ahead {ahead:+.2f} out {aside:+.2f} contact {tc:.2f} flight {tf:.2f} push {push:.1f} skew {skew:+.1f} height {y0:.2f}->{y1:.2f}")
        s, th = ns, nth; par = 1 - par
if __name__ == '__main__':
    for s, th, tgt, par in [(9.5, 90, 9.5, 0), (9.5, 90, 9.5, 1), (9.5, 45, 9.5, 0), (9.5, 180, 9.5, 0), (9.5, 0, 0.0, 0)]:
        print(f"from {s} m/s, {th} degrees off, to {tgt} m/s, next foot {'outside' if par == 0 else 'inside'}"); follow(s, th, tgt, par=par)
