# Measure takes: for each foot's time down, how far its contact slides, the knee's bend at touchdown
# and deepest, the pelvis's turn and the trunk's lean toward the turn at mid-contact.
import sys, math, numpy as np
sys.path.insert(0, '/tmp/chr/gen'); import synth as S
L1, L2, HIP, HIP_DROP = S.L1, S.L2, S.HIP, S.HIP_DROP
def read(path):
    takes = {}; cur = None
    for line in open(path):
        t = line.split()
        if t[:1] == ['take']: cur = t[1]; takes[cur] = []
        elif t[:1] == ['at']: takes[cur].append([float(x) for x in t[1:]])
    return {k: np.array(v) for k, v in takes.items()}
def D(f, k): return f[k * 3:k * 3 + 3]
def ankle(f, sd):
    sg = 1 if sd == 'L' else -1; i = 10 if sd == 'L' else 12
    root = f[48:51]
    return root + D(f, 0) * HIP * sg - D(f, 1) * HIP_DROP + D(f, i) * L1 + D(f, i + 1) * L2
def contact(f, sd):
    # the sole's lowest point, heel to ball
    a = ankle(f, sd); ft = D(f, 14 if sd == 'L' else 15); up = S.foot_up(ft)
    pts = [a + ft * (S.SOLE_HEEL[0] + (S.SOLE_BALL[0] - S.SOLE_HEEL[0]) * u) + up * (S.SOLE_HEEL[1] + (S.SOLE_BALL[1] - S.SOLE_HEEL[1]) * u) for u in np.linspace(0, 1, 8)]
    return min(pts, key=lambda q: q[1])
def yaw_of(v): return math.degrees(math.atan2(v[0], v[2]))
for name, F in read(sys.argv[1]).items():
    if len(sys.argv) > 2 and name not in sys.argv[2:]: continue
    print(name)
    for sd, col, ti in (('L', 52, 10), ('R', 53, 12)):
        down = F[:, col] > 0.5
        i = 0
        while i < len(F):
            if down[i]:
                j = i
                while j < len(F) and down[j]: j += 1
                A = np.array([contact(F[k], sd) for k in range(i, j)])
                # (the heel's slide while it is the lower end, and the ball's while it is)
                def ends(k):
                    a = ankle(F[k], sd); ft = D(F[k], 14 if sd == 'L' else 15); up = S.foot_up(ft)
                    return a + ft * S.SOLE_HEEL[0] + up * S.SOLE_HEEL[1], a + ft * S.SOLE_BALL[0] + up * S.SOLE_BALL[1]
                E = [ends(k) for k in range(i, j)]
                hs = [e[0] for e in E if e[0][1] <= e[1][1]]; bs = [e[1] for e in E if e[1][1] < e[0][1]]
                def drift(pts): return max(np.linalg.norm((p - pts[0])[[0, 2]]) for p in pts) * 100 if pts else 0.0
                slide_hb = max(drift(hs), drift(bs))
                knee = [math.degrees(math.acos(np.clip(D(F[k], ti) @ D(F[k], ti + 1), -1, 1))) for k in range(i, j)]
                m = (i + j - 1) // 2
                pel = D(F[m], 0); pel_fwd = np.cross(pel, [0, 1, 0])
                v0 = F[max(i - 3, 0), 48:51]; v1 = F[i, 48:51]; way = v1 - v0
                chest = D(F[m], 3)
                lat = np.cross([0, 1, 0], way); lat = lat / max(np.linalg.norm(lat), 1e-9)
                lean = math.degrees(math.asin(np.clip(chest @ lat, -1, 1)))
                slide = np.max(np.linalg.norm((A - A[0])[:, [0, 2]], axis=1)) * 100
                print(f"  {sd} frames {i}-{j-1}: heel/ball slide {slide_hb:4.1f} cm, height {A[:,1].min()*100:+4.1f}..{A[:,1].max()*100:+4.1f}; knee {knee[0]:3.0f} -> {max(knee):3.0f} -> {knee[-1]:3.0f}; heading {yaw_of(way):+4.0f} pelvis faces {yaw_of(pel_fwd):+4.0f}; chest leans left {lean:+3.0f}; hips {F[i,49]:.2f}->{min(F[i:j,49]):.2f}")
                i = j
            else: i += 1
