# Local type inference

Use `:=` to declare a local variable whose type comes from its initializer:

```l8
count := 0;
title := "Genesis";
reader := &read_chapter;

count = count + 1;
```

The initializer determines one fixed type. Later assignments must fit that
type; they never change it. Inference adds no runtime work. The compiler stores
the inferred type on the local and applies the ordinary assignment, lifetime,
region, exception, and definite-assignment checks.

Literal defaults apply: an unsuffixed integer is `int`, an unsuffixed floating
literal is `f32`, and a string literal is `str`. Suffixes such as `i32` and `f64`
retain their types. Array literals infer slices; copying a fixed-array variable
retains its fixed-array type. Function values retain the complete signature,
including named parameter labels, effects, and lifetime bounds.

Keep an annotation when the initializer needs an expected type:

```l8
text := "hello";                 // immutable str
mutable_text: []i8 = "hello";     // contextually typed mutable bytes
optional: ?*int = null;           // null alone has no inferable type
pending: int;                    // no initializer: type required
```

An initializer must produce a value. A void call or a `noreturn` expression
cannot initialize an inferred local. `null` alone, including a block or branch
expression yielding only null, requires an annotation.

The new binding becomes visible after its initializer. When shadowing an outer
local, the initializer can refer to the outer binding:

```l8
value := 3;
{
    value := value + 1; // inner value is 4; outer value stays 3
}
```

`:=` is limited to local declarations. Function parameters, function result
types, record fields, and globals keep their existing syntax and annotation
requirements. The formatter preserves `:=` instead of adding an inferred type.
Both compiler source stages support it; the saved bootstrap is unchanged.
