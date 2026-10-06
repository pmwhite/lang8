# Build, test, self-host, and promote the L8 bootstrap executable.
# See BOOTSTRAP.md for the two-stage source model.
#
# Every step is a file target or a stamp under .build/ok, so `make -jN` runs
# independent steps in parallel and later runs skip steps whose inputs are
# unchanged. Test runners share make's job slots. `make V=1` streams step
# output; otherwise it is kept in .build/logs/STEP.log.
#
#   make            format src2, then build and test everything (default)
#   make check      build and test without formatting src2
#   make help       list targets

.DELETE_ON_ERROR:
.SUFFIXES:
MAKEFLAGS += --no-builtin-rules --no-print-directory

export BUILD := .build
OK := $(BUILD)/ok
STEP := tools/step.sh

RUNTIME := runtime.s
STDLIB := $(wildcard stdlib/*.l8 stdlib/*.s)
SRC1 := $(wildcard src1/*.l8)
SRC2 := $(wildcard src2/*.l8)
# Programs import one another, the standard library, and native assembly.
PROGRAMS := $(shell find programs stdlib -type f \( -name '*.l8' -o -name '*.s' \))
STDLIB_TESTS := $(shell find stdlib -type f \( -name '*.l8' -o -name '*.s' \))
TESTS := $(shell find tests -type f -not -path '*/__pycache__/*')
# Every compiler fixture and CLI cram test; tests/pending is not run.
COMPILER_TESTS := $(sort $(shell find tests/compiler tests/callbacks -name '*.l8') $(wildcard tests/cli/*.t))
# Fixtures that the stage-1 compiler (built from src1) must pass before it
# builds stage 2.
STAGE1_TESTS := tests/compiler/bool.l8 \
	tests/compiler/byte.l8 \
	tests/compiler/check_index_bootstrap.l8 \
	tests/compiler/enum.l8 \
	tests/compiler/fib.l8 \
	tests/compiler/forward.l8 \
	tests/compiler/hello.l8 \
	tests/compiler/i8.l8 \
	tests/compiler/imports/main.l8 \
	tests/compiler/logic.l8 \
	tests/compiler/narrow.l8 \
	tests/compiler/null.l8 \
	tests/compiler/string.l8 \
	tests/compiler/try_value_nested.l8

# `build TOOL SOURCE`: build into $@ without leaving a partial file behind.
build = ./$(1) build $(2) -o $@.tmp && mv -f $@.tmp $@

.PHONY: all check fmt selfhost compiler-test game game-test stdlib-test \
	terminal terminal-test callback-test http http-test websocket websocket-test wasm-test web \
	install-bootstrap promote promote-bin1 promote-bin2 promote-source clean help

# Formatting rewrites src2, so finish it before anything reads the sources.
all:
	@$(MAKE) -s $(OK)/fmt $(OK)/stage1-tests
	@$(MAKE) -s check

check: $(OK)/stage1-tests l8 $(OK)/stdlib-tests $(BUILD)/block-game $(OK)/game-tests

# ---- compiler stages ----

install-bootstrap: l8c0

l8c0: bootstrap
	@$(STEP) 'install bootstrap' sh -c 'cp bootstrap $@.tmp && chmod +x $@.tmp && mv -f $@.tmp $@'

l8c1: l8c0 $(SRC1) $(STDLIB) $(RUNTIME)
	@$(STEP) 'stage1 from l8c0' sh -c '$(call build,l8c0,src1/main.l8)'

l8c2: l8c1 $(SRC2) $(STDLIB) $(RUNTIME)
	@$(STEP) 'stage2 from l8c1' sh -c '$(call build,l8c1,src2/main.l8)'

l8c3: l8c2 $(SRC2) $(STDLIB) $(RUNTIME)
	@$(STEP) 'stage3 from l8c2' sh -c '$(call build,l8c2,src2/main.l8)'

l8c4: l8c3 $(SRC2) $(STDLIB) $(RUNTIME)
	@$(STEP) 'stage4 from l8c3' sh -c '$(call build,l8c3,src2/main.l8)'

$(OK)/fixpoint: l8c3 l8c4 | $(OK)
	@$(STEP) 'check fixpoint' sh -c 'cmp -s l8c3 l8c4 || { echo "l8c3 and l8c4 differ (src2 is not at fixpoint)"; exit 1; }'
	@touch $@

# Install the tested self-hosted compiler as ./l8.
SELFHOST_CHECKS := $(OK)/fixpoint $(OK)/fmt-check $(OK)/compiler-tests

l8: l8c3 $(SELFHOST_CHECKS)
	@cp l8c3 $(BUILD)/l8.next && mv -f $(BUILD)/l8.next $@

selfhost: l8

# ---- formatting ----

# Rewrite only files whose formatting changes, so formatted sources keep
# their timestamps and downstream steps stay cached. The formatter is built
# from src2, so the sources alone decide whether formatting is current.
$(OK)/fmt: $(SRC2) tools/format_src2.sh | l8c2 $(OK)
	@$(STEP) 'format src2' tools/format_src2.sh write l8c2
	@touch $@

fmt: $(OK)/fmt

$(OK)/fmt-check: l8c2 $(SRC2) tools/format_src2.sh | $(OK)
	@$(STEP) 'check src2 format' tools/format_src2.sh check l8c2
	@touch $@

# ---- compiler tests ----

# `l8 test` builds and runs each file's tests; see TESTING.md. Under make it
# shares the job slots of a recipe marked with `+`.

$(OK)/stage1-tests: l8c1 $(TESTS) $(STDLIB) $(RUNTIME) | $(OK)
	+@$(STEP) 'compiler tests 1' ./l8c1 test $(STAGE1_TESTS)
	@touch $@

$(OK)/compiler-tests: l8c3 $(TESTS) $(STDLIB) $(RUNTIME) $(SRC2) | $(OK)
	+@$(STEP) 'compiler tests 3' ./l8c3 test $(COMPILER_TESTS)
	@touch $@

compiler-test: $(OK)/stage1-tests $(OK)/compiler-tests

# ---- standard library and programs ----

# These use l8c3 so they can run alongside the compiler tests; `l8` is only
# installed once those pass.

$(OK)/stdlib-tests: l8c3 $(STDLIB_TESTS) $(RUNTIME) | $(OK)
	+@$(STEP) 'stdlib tests' ./l8c3 test $(wildcard stdlib/tests/*.l8)
	@touch $@

stdlib-test: $(OK)/stdlib-tests

$(BUILD)/block-game: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'block game' sh -c '$(call build,l8c3,programs/block-game/block-game.l8)'

# tests.l8 imports every game test, so the game is built once.
$(OK)/game-tests: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	+@$(STEP) 'game tests' ./l8c3 test programs/block-game/tests.l8
	@touch $@

game: $(BUILD)/block-game
game-test: $(OK)/game-tests

# A terminal may be running from the previous output; `mv` replaces the
# directory entry instead of rewriting its live inode.
$(BUILD)/terminal: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'terminal' sh -c '$(call build,l8c3,programs/terminal/terminal.l8)'

$(BUILD)/terminal-pty-test: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'PTY test build' sh -c '$(call build,l8c3,programs/terminal/test_pty.l8)'

terminal: $(BUILD)/terminal

# These depend on the shell and display, so they always run.
terminal-test: $(BUILD)/terminal $(BUILD)/terminal-pty-test
	+@$(STEP) 'terminal tests' ./l8c3 test programs/terminal/test_scene.l8 programs/terminal/test_presentation.l8
	@$(STEP) 'PTY system shell' env SHELL=/bin/bash LC_ALL=C.UTF-8 L8_EXPECT_BASH=yes L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= $(BUILD)/terminal-pty-test
	@$(STEP) 'PTY fallback' env SHELL=/definitely/missing LC_ALL=C.UTF-8 L8_EXPECT_BASH= L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= $(BUILD)/terminal-pty-test
	@$(STEP) 'PTY closed stdio' env SHELL=/bin/sh LC_ALL=C.UTF-8 L8_EXPECT_BASH= L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= $(BUILD)/terminal-pty-test --closed-stdio
	@$(STEP) 'PTY Wayland' python3 programs/terminal/test_integration.py $(BUILD)/terminal

# Stage 1 must also handle function values and C callbacks (needs cc and as).
callback-test: l8c1
	@$(STEP) 'C callbacks' python3 tests/callbacks/test_callbacks.py ./l8c1 $(BUILD)/callbacks

$(BUILD)/http/server: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/http
	@$(STEP) 'HTTP server' sh -c '$(call build,l8c3,programs/examples/http-server.l8)'

$(BUILD)/http/client: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/http
	@$(STEP) 'HTTP client' sh -c '$(call build,l8c3,programs/examples/http-client.l8)'

http: $(BUILD)/http/server $(BUILD)/http/client

$(OK)/http-tests: l8c3 $(BUILD)/http/server $(BUILD)/http/client $(PROGRAMS) \
		$(wildcard programs/http/tests/*.py programs/http/spec/*) | $(OK)
	@$(STEP) 'HTTP spec check' python3 programs/http/spec/fetch.py --check
	+@$(STEP) 'HTTP lib tests' ./l8c3 test programs/http/tests/unit.l8 programs/http/tests/date.l8
	@$(STEP) 'HTTP protocol' env HTTP_BUILD=$(BUILD)/http L8C=$(CURDIR)/l8c3 python3 -m unittest discover -s programs/http/tests -v
	@touch $@

http-test: $(OK)/http-tests

$(BUILD)/websocket/server: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/websocket
	@$(STEP) 'WebSocket server' sh -c '$(call build,l8c3,programs/examples/websocket-server.l8)'

$(BUILD)/websocket/client: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/websocket
	@$(STEP) 'WebSocket client' sh -c '$(call build,l8c3,programs/examples/websocket-client.l8)'

websocket: $(BUILD)/websocket/server $(BUILD)/websocket/client

$(OK)/websocket-tests: l8c3 $(BUILD)/websocket/server $(BUILD)/websocket/client $(PROGRAMS) $(wildcard programs/websocket/tests/*.py) | $(OK)
	@$(STEP) 'WebSocket tests' env WEBSOCKET_BUILD=$(BUILD)/websocket python3 -m unittest discover -s programs/websocket/tests -v
	+@$(STEP) 'WebSocket vectors' ./l8c3 test programs/websocket/tests/unit.l8
	@touch $@

websocket-test: $(OK)/websocket-tests

$(OK):
	@mkdir -p $@

# ---- WebAssembly (needs Node) ----

WEB := $(wildcard web/*.js web/*.mjs)
# tests/compiler/native calls x86 assembly, which a module cannot contain.
WASM_TESTS := $(filter-out tests/compiler/native/%,$(sort $(shell find tests/compiler tests/callbacks -name '*.l8'))) \
	$(wildcard stdlib/tests/*.l8) programs/block-game/tests.l8

# The compiler as a module; under Node it must rebuild itself unchanged.
$(BUILD)/l8.wasm: l8c3 $(SRC2) $(STDLIB) | $(OK)
	@$(STEP) 'wasm compiler' sh -c './l8c3 wasm src2/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(OK)/wasm-fixpoint: $(BUILD)/l8.wasm $(WEB) | $(OK)
	@$(STEP) 'wasm fixpoint' sh -c 'node web/run.mjs $(BUILD)/l8.wasm wasm src2/main.l8 -o $(BUILD)/l8-self.wasm && cmp $(BUILD)/l8.wasm $(BUILD)/l8-self.wasm'
	@touch $@

# Compiler, callback, standard library, and game tests built as modules.
$(OK)/wasm-tests: l8c3 $(TESTS) $(PROGRAMS) $(WEB) | $(OK)
	+@$(STEP) 'wasm tests' ./l8c3 test --wasm $(WASM_TESTS)
	@touch $@

# A program that pauses and resumes everywhere it can (`l8 wasm --async`).
$(OK)/wasm-resume: l8c3 web/tests/resume.l8 web/tests/resume.mjs $(WEB) | $(OK)
	@$(STEP) 'wasm resume' sh -c './l8c3 wasm --async l8_pause web/tests/resume.l8 -o $(BUILD)/resume.wasm && \
		./l8c3 wasm web/tests/resume.l8 -o $(BUILD)/resume-plain.wasm && \
		node web/tests/resume.mjs $(BUILD)/resume.wasm $(BUILD)/resume-plain.wasm'
	@touch $@

wasm-test: $(OK)/wasm-fixpoint $(OK)/wasm-tests $(OK)/wasm-resume

# The playground: a static site in .build/web with the compiler as a module.
# Serve it with `python3 -m http.server -d .build/web`.
WEB_SITE := $(BUILD)/web
WEB_FILES := web/index.html $(wildcard web/*.js web/examples/*.l8 web/game/*)

$(BUILD)/block-game.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'block game wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/block-game/block-game.l8 -o $@.tmp && mv -f $@.tmp $@'

$(OK)/web: $(BUILD)/l8.wasm $(BUILD)/block-game.wasm $(WEB_FILES) $(STDLIB) | $(OK)
	@$(STEP) 'web site' sh -c 'rm -rf $(WEB_SITE) && mkdir -p $(WEB_SITE)/stdlib $(WEB_SITE)/examples $(WEB_SITE)/game && \
		cp web/index.html web/*.js $(WEB_SITE)/ && cp web/examples/*.l8 $(WEB_SITE)/examples/ && \
		cp $(STDLIB) $(WEB_SITE)/stdlib/ && cp $(BUILD)/l8.wasm $(WEB_SITE)/ && \
		cp web/game/* $(BUILD)/block-game.wasm programs/block-game/world.txt $(WEB_SITE)/game/'
	@touch $@

web: $(OK)/web

# ---- promotion (updates the working tree; commit the result alone) ----

confirm = @if [ "$(FORCE)" != 1 ]; then printf 'About to update %s. Promote in its own commit. Continue? [y/N] ' '$(1)'; \
	read ans; [ "$$ans" = y ] || [ "$$ans" = Y ] || { echo aborted; exit 1; }; fi

promote-bin1: l8c1
	$(call confirm,bootstrap from stage 1)
	cp l8c1 bootstrap && chmod +x bootstrap

promote-bin2: l8
	$(call confirm,bootstrap from stage 2)
	cp l8c3 bootstrap && chmod +x bootstrap

promote-source: l8
	$(call confirm,src1 from src2)
	rm -rf src1 && cp -R src2 src1

promote: l8
	$(call confirm,src1 and bootstrap)
	rm -rf src1 && cp -R src2 src1 && cp l8c3 bootstrap && chmod +x bootstrap

clean:
	rm -f l8c0 l8c1 l8c2 l8c3 l8c4 l8
	rm -rf $(BUILD)

help:
	@echo 'make [-jN] [V=1] [target]'
	@echo '  all (default)   format src2, then build and test everything'
	@echo '  check           build and test without formatting'
	@echo '  fmt             format src2 with the stage-2 compiler'
	@echo '  selfhost        build l8c1..l8c4, check the fixpoint, run compiler tests, install ./l8'
	@echo '  compiler-test   stage-1 fixtures, then all fixtures and CLI cram tests (tests/)'
	@echo '  stdlib-test, game, game-test, terminal, terminal-test, callback-test'
	@echo '  http, http-test, websocket, websocket-test'
	@echo '  wasm-test       run the tests as WebAssembly under Node; check the wasm compiler fixpoint'
	@echo '  web             build the playground site in .build/web'
	@echo '  promote, promote-bin1, promote-bin2, promote-source   (FORCE=1 skips the prompt)'
	@echo '  clean'
	@echo 'tools/profile.py times the compiler self-build, game build, and formatting.'
