# Race

Build from the checkout root with `make race` and run `.build/race` under X11
or XWayland. The native renderer uses OpenGL; geometry and model smoke checks
can run without opening a window.

Program-owned storage is bounded. The world and part meshes reserve 640,000
and 120,000 vertices (twelve floats each). Model pools hold 64 cars, sixteen
remote seats, seven bots and one renderer. The normal application creates one
world/part mesh pair; constructing that pair again resets their counts.
Temporary track construction uses 65,536-entry curve/distance work buffers.
Two 64 KiB slots hold translated shaders until OpenGL copies their contents.
Existing uniform, font, noise and upload capacities are preserved in static
backing or function frames. Pool exhaustion terminates before an invalid write.

No explicit `new` or allocating `bytes()` shader copies remain. Other implicit
slice literals and native X11/OpenGL behavior still need allocation audit before
this entry point can be certified as a complete static program.
