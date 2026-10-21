import sys, numpy as np
sys.path.insert(0, '/tmp/chr/gen')
import rbds, stats, os
for speed in ('25', '35', '45'):
    cyc = []; subj = 0
    for sid in range(1, 40):
        if not os.path.exists(f'/tmp/chr/rbds/RBDS{sid:03d}runT{speed}markers.txt') or not os.path.exists(f'/tmp/chr/rbds/RBDS{sid:03d}static.txt') or not os.path.exists(f'/tmp/chr/rbds/RBDS{sid:03d}runT{speed}forces.txt'): continue
        try:
            cs = rbds.cycles(sid, speed)
        except Exception as e:
            print('skip', sid, speed, e); continue
        if len(cs) < 5: continue
        subj += 1
        cyc += cs[:15]
    stats.summary(cyc, f'RBDS {speed[0]}.{speed[1]} m/s, {subj} runners')
