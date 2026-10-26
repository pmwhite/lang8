# Named arguments

A parameter marked `named` must be supplied by label. Existing parameters
remain positional:

```l8
resize(image: *Image, named width: int, named height: int) { ... }

resize(image, width: 800, height: 600);
resize(height: 600, image, width: 800);
```

Positional arguments bind to positional parameters in declaration order,
skipping named parameters. Labeled arguments can appear anywhere and in any
order. Every parameter is required and must receive exactly one argument.
Unknown labels, duplicate labels, missing arguments, and supplying a named
parameter positionally are errors. A positional parameter cannot be supplied
by label. Labels match parameter names exactly; they do not affect function
lookup. There are no defaults, argument spreading, or label shorthand.

Argument expressions evaluate once, from left to right as written, even when
their labels reorder the parameters. Earlier values are captured before later
expressions execute. For a call through a function value, the callee expression
evaluates first. If an expression raises, later expressions and the call do
not execute. Copying, contextual typing, lifetime bounds, exception checks,
and region requirements follow the corresponding parameter.

Function types declare the same parameter modes:

```l8
callback: fn(image: *Image, named width: int, named height: int) = &resize;
callback(image, height: 600, width: 800);
```

Compatible function signatures must have the same parameter order, modes,
labels, types, and existing lifetime and effect contracts. Positional parameter
names may differ; named parameter names are public labels and must match.
Renaming a label is a source API change. The runtime calling convention and
function-pointer representation are unchanged.

An `extern` declaration can mark parameters `named`; these labels belong to
the L8 declaration and do not change the external symbol or ABI. Compiler
intrinsics without declared signatures (`len`, `bytes`, `cstr`, `memcpy`, and
`read`) accept only positional arguments.

`named` is contextual before a parameter declaration. A parameter or local
called `named` remains valid, as does `named named: int` for a named parameter
whose label is `named`.

Both source stages implement this syntax. Build a compiler from the sources;
the saved bootstrap executable is unchanged.
