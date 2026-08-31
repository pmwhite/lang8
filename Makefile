CC = gcc
CFLAGS = -Wall -Wextra -std=c11 -O2

.PHONY: all clean test selfhost

all: l8c0

l8c0: bootstrap.c
	$(CC) $(CFLAGS) -o l8c0 bootstrap.c

# Assemble+link an L8 program: make prog PROG=examples/hello
prog: l8c0 runtime.s
	./l8c0 $(PROG).l8 > $(PROG).s
	$(CC) -nostdlib -static -o $(PROG) $(PROG).s runtime.s

test: l8c0
	./l8c0 examples/hello.l8 > /tmp/hello.s
	$(CC) -nostdlib -static -o /tmp/hello /tmp/hello.s runtime.s
	test "$$(/tmp/hello)" = "Hi"
	./l8c0 examples/fib.l8 > /tmp/fib.s
	$(CC) -nostdlib -static -o /tmp/fib /tmp/fib.s runtime.s
	test "$$(/tmp/fib)" = "55"
	@echo "OK: examples"

# Stage1: bootstrap compiles self-hosted compiler
# Stage2/3: self-hosted compiles itself twice; assemblies must match
selfhost: l8c0
	./l8c0 compiler.l8 > /tmp/l8c1.s
	$(CC) -nostdlib -static -o l8c1 /tmp/l8c1.s runtime.s
	./l8c1 compiler.l8 > /tmp/l8c2.s
	$(CC) -nostdlib -static -o l8c2 /tmp/l8c2.s runtime.s
	./l8c2 compiler.l8 > /tmp/l8c3.s
	diff -q /tmp/l8c2.s /tmp/l8c3.s
	@echo "OK: self-hosted fixed point (stage2 == stage3)"
	./l8c2 examples/hello.l8 > /tmp/hello.s
	$(CC) -nostdlib -static -o /tmp/hello /tmp/hello.s runtime.s
	test "$$(/tmp/hello)" = "Hi"
	@echo "OK: stage2 compiles examples"

clean:
	rm -f l8c0 l8c1 l8c2 examples/hello examples/fib examples/*.s /tmp/hello /tmp/fib /tmp/l8c*.s
