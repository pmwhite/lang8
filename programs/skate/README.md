# Sketchy Landing

Build from the checkout root with `make skate` and run `.build/skate` under X11
or XWayland. Arrow keys steer, Space controls tricks, R restarts and N selects
a new course. The renderer uses OpenGL.

Program-owned storage is bounded. World and part meshes reserve 1,600,000 and
60,000 vertices (ten floats each). Model pools hold four movers, two animation
states, one renderer and sixteen 512-byte retained UI text owners. The normal
application creates one mesh pair; constructing it again resets its counts.
Two 64 KiB shader slots remain live until OpenGL copies the shader arguments.
Uniform arrays are permanent; texture/upload scratch lives in fixed function
frames. Pool exhaustion terminates before an invalid write.

No explicit `new` or allocating `bytes()` shader copies remain. Other implicit
slice literals and native X11/OpenGL behavior still need allocation audit before
this entry point can be certified as a complete static program.
