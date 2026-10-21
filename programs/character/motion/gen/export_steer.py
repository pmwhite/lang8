# The solved values (dp2.py) as the steering block the viewer reads (see FORMAT.md, Steering).
import math, pickle, sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import dp2
pol = pickle.load(open('/tmp/chr/gen/policy2.pkl', 'rb'))
targets = sorted(pol)
out = ["# The solved time to where the stick says, from each state (see motion/README.md): generated",
       "# by motion/gen/dp2.py and export_steer.py.", "", "steering run",
       "  targets " + " ".join(f"{t:g}" for t in targets),
       "  speeds " + " ".join(f"{s:g}" for s in dp2.SP),
       "  heights " + " ".join(f"{y:g}" for y in dp2.YA),
       "  falls " + " ".join(f"{w:g}" for w in dp2.VA),
       f"  angles {len(dp2.TGRID)} 5",
       f"  drift {dp2.DRIFT:g}"]
for t in targets:
    V = pol[t][0]
    for par in (0, 1):
        for si in range(len(dp2.SP)):
            for yi in range(len(dp2.YA)):
                for wi in range(len(dp2.VA)):
                    out.append("  value " + " ".join(f"{min(V[par, si, ti, yi, wi], 60.0):.2f}" for ti in range(len(dp2.TGRID))))
open(sys.argv[1], 'w').write("\n".join(out) + "\n")
print(len(out), 'lines')
