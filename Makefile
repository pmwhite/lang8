# Build, test, self-host, and promote the L8 bootstrap executable.
# See BOOTSTRAP.md for the two-stage source model.
#
# Every step is a file target or a stamp under .build/ok, so `make -jN` runs
# independent steps in parallel and later runs skip steps whose inputs are
# unchanged. Test runners share make's job slots. `make V=1` streams step
# output; otherwise it is kept in .build/logs/STEP.log.
#
#   make            format src2, then build apps and test the compiler (default)
#   make check      build apps and test the compiler without formatting src2
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

.PHONY: all check fmt selfhost compiler-test game skate race cad recipes better bible-web bible-spoken \
	terminal callback-test http websocket wasm-test web \
	profile-explorer \
	install-bootstrap promote promote-bin1 promote-bin2 promote-source clean help

# Formatting rewrites src2, so finish it before anything reads the sources.
all:
	@$(MAKE) -s $(OK)/fmt $(OK)/stage1-tests
	@$(MAKE) -s check

check: $(OK)/stage1-tests l8 $(BUILD)/block-game $(BUILD)/skate $(BUILD)/race $(BUILD)/cad $(BUILD)/recipes \
	$(BUILD)/profile-explorer \
	$(BUILD)/better $(BUILD)/better-ios.s $(BUILD)/ios-check.s $(BUILD)/better-ios-sim $(BUILD)/better-android.s $(OK)/bible-web $(BUILD)/bible-ios.s $(BUILD)/bible-ios-sim

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

$(BUILD)/block-game: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'block game' sh -c '$(call build,l8c3,programs/block-game/block-game.l8)'

game: $(BUILD)/block-game

$(BUILD)/skate: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'skate' sh -c '$(call build,l8c3,programs/skate/main.l8)'

skate: $(BUILD)/skate

$(BUILD)/cad: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'cad' sh -c '$(call build,l8c3,programs/cad/main.l8)'

cad: $(BUILD)/cad

# The designs' board files, made again from their generators and routed
# whole (programs/cad/tools/finish.l8): run after changing a generator.
$(BUILD)/cad-finish: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'cad finish' sh -c '$(call build,l8c3,programs/cad/tools/finish.l8)'

.PHONY: cad-boards
cad-boards: $(BUILD)/cad-finish
	python3 programs/cad/tools/handheld.py $(BUILD)/handheld-placed.pcb
	$(BUILD)/cad-finish $(BUILD)/handheld-placed.pcb programs/cad/handheld.pcb
	python3 programs/cad/tools/dock.py $(BUILD)/dock-placed.pcb
	$(BUILD)/cad-finish $(BUILD)/dock-placed.pcb programs/cad/dock.pcb

$(BUILD)/recipes: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'recipes' sh -c '$(call build,l8c3,programs/recipes/main.l8)'

recipes: $(BUILD)/recipes

$(BUILD)/race: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'race' sh -c '$(call build,l8c3,programs/race/main.l8)'

race: $(BUILD)/race

$(BUILD)/better: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'better' sh -c '$(call build,l8c3,programs/better/main.l8)'

better: $(BUILD)/better

# Better as an iPhone app, and the arm64 runtime's check, as arm64 assembly
# for iOS (built into an app on a Mac: see programs/better/README.md).
$(BUILD)/better-ios.s: l8c3 $(PROGRAMS) runtime-arm64-darwin.s | $(OK)
	@$(STEP) 'better for iOS' sh -c './l8c3 arm64 --target ios programs/better/ios.l8 -o $@.tmp && mv -f $@.tmp $@'

# Better as an Android app's code, as arm64 assembly (built into an APK by
# tools/android/build.sh: see programs/better/README.md).
$(BUILD)/better-android.s: l8c3 $(PROGRAMS) runtime-arm64-android.s stdlib/write.arm64-android.s | $(OK)
	@$(STEP) 'better for Android' sh -c './l8c3 arm64 --target android programs/better/android.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/ios-check.s: l8c3 $(PROGRAMS) runtime-arm64-darwin.s | $(OK)
	@$(STEP) 'iOS check' sh -c './l8c3 arm64 --target ios programs/ios/check.l8 -o $@.tmp && mv -f $@.tmp $@'

# The same, assembled and linked by the compiler into Mach-O executables
# for the simulator (see src2/a64link.l8), whose code signatures and fixups
# tools/ios/macho.py checks.
IOS_LINK = ./l8c3 arm64 --target ios-sim --exe --imports tools/ios/imports.txt
$(BUILD)/better-ios-sim: l8c3 $(PROGRAMS) runtime-arm64-darwin.s tools/ios/imports.txt | $(OK)
	@$(STEP) 'better for the simulator' sh -c '$(IOS_LINK) $(foreach f,UIKit Foundation CoreLocation QuartzCore OpenGLES AVFoundation,--framework $(f)) programs/better/ios.l8 -o $@.tmp && python3 -I tools/ios/macho.py check $@.tmp && mv -f $@.tmp $@'

# The Bible app, built for the web and iOS.
$(BUILD)/bible.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'bible wasm' sh -c './l8c3 wasm programs/bible/web/app.l8 -o $@.tmp && mv -f $@.tmp $@'

# The web reader's site (WEB.md §W1.9) in .build/bible-site: the marketing
# pages, and read/: the shell, About, the app and its assets under hashed
# names, the texts whole and by book with their sizes tables (tools/sizes.l8),
# generated by programs/bible/web/page/build.py.
# Serve it as smoothbible.com does: node programs/bible/web/page/serve.mjs.
# The size tool imports text/estimate and stdlib, not the web/iOS UI.
$(BUILD)/bible-sizes: l8c3 programs/bible/tools/sizes.l8 programs/bible/core/text.l8 programs/bible/web/estimate.l8 $(STDLIB) $(RUNTIME) | $(OK)
	@$(STEP) 'bible sizes tool' sh -c '$(call build,l8c3,programs/bible/tools/sizes.l8)'

# Data packaging is independent of UI assets and compiler output. Each version
# gets one job slot, so compression shares make's parallelism with other work.
BIBLE_VERSIONS := bsb kjv web asv ylt
BIBLE_DATA := $(BUILD)/bible-data
BIBLE_VERSION_STAMPS := $(addprefix $(BIBLE_DATA)/,$(addsuffix .stamp,$(BIBLE_VERSIONS)))

$(BIBLE_DATA):
	@mkdir -p $@

$(BIBLE_VERSION_STAMPS): $(BIBLE_DATA)/%.stamp: programs/bible/data/%.txt $(BUILD)/bible-sizes programs/bible/web/page/build.py | $(BIBLE_DATA)
	@$(STEP) 'bible data $*' python3 -I programs/bible/web/page/build.py version $(BUILD)/bible-sizes $< $(BIBLE_DATA)/$* $*
	@touch $@

$(BIBLE_DATA)/refs.gz: programs/bible/data/refs.txt programs/bible/web/page/build.py | $(BIBLE_DATA)
	@$(STEP) 'bible references' python3 -I programs/bible/web/page/build.py refs $< $@

$(BIBLE_DATA)/manifest.json: $(BIBLE_VERSION_STAMPS) $(BIBLE_DATA)/refs.gz programs/bible/web/page/build.py
	@$(STEP) 'bible data manifest' python3 -I programs/bible/web/page/build.py manifest $(BIBLE_DATA) $@

$(OK)/bible-web: $(BIBLE_DATA)/manifest.json $(BUILD)/bible.wasm web/l8-runtime.js web/dom.js $(wildcard programs/bible/web/page/* programs/bible/web/page/fonts/* programs/bible/site/* programs/bible/site/*/*) | $(OK)
	@$(STEP) 'bible web site' python3 -I programs/bible/web/page/build.py site $(BUILD)/bible.wasm $(BIBLE_DATA)/manifest.json $(BUILD)/bible-site
	@touch $@

bible-web: $(OK)/bible-web

# What the app says aloud, a verse a line (DESIGN.md §12.2.3), for the
# aligner: make bible-spoken VERSION=bsb (or web).
VERSION ?= bsb
bible-spoken: l8c3 $(PROGRAMS) $(RUNTIME)
	@./l8c3 build programs/bible/tools/spoken.l8 -o $(BUILD)/bible-spoken && $(BUILD)/bible-spoken programs/bible/data/$(VERSION).txt

$(BUILD)/bible-ios.s: l8c3 $(PROGRAMS) runtime-arm64-darwin.s | $(OK)
	@$(STEP) 'bible for iOS' sh -c './l8c3 arm64 --target ios programs/bible/ios/app.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/bible-ios-sim: l8c3 $(PROGRAMS) runtime-arm64-darwin.s tools/ios/imports.txt programs/bible/ios/frameworks | $(OK)
	@$(STEP) 'bible for the simulator' sh -c '$(IOS_LINK) $(foreach f,$(shell cat programs/bible/ios/frameworks),--framework $(f)) programs/bible/ios/app.l8 -o $@.tmp && mv -f $@.tmp $@'

# A terminal may be running from the previous output; `mv` replaces the
# directory entry instead of rewriting its live inode.
$(BUILD)/terminal: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'terminal' sh -c '$(call build,l8c3,programs/terminal/terminal.l8)'

terminal: $(BUILD)/terminal

$(BUILD)/profile-explorer: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'profile explorer' sh -c '$(call build,l8c3,programs/profile-explorer/profile-explorer.l8)'

profile-explorer: $(BUILD)/profile-explorer

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

$(BUILD)/websocket/server: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/websocket
	@$(STEP) 'WebSocket server' sh -c '$(call build,l8c3,programs/examples/websocket-server.l8)'

$(BUILD)/websocket/client: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@mkdir -p $(BUILD)/websocket
	@$(STEP) 'WebSocket client' sh -c '$(call build,l8c3,programs/examples/websocket-client.l8)'

websocket: $(BUILD)/websocket/server $(BUILD)/websocket/client

$(OK):
	@mkdir -p $@

# ---- WebAssembly (needs Node) ----

WEB := $(wildcard web/*.js web/*.mjs)
# tests/compiler/native calls x86 assembly, which a module cannot contain.
WASM_TESTS := $(filter-out tests/compiler/native/%,$(sort $(shell find tests/compiler tests/callbacks -name '*.l8')))

# The compiler as a module; under Node it must rebuild itself unchanged.
$(BUILD)/l8.wasm: l8c3 $(SRC2) $(STDLIB) | $(OK)
	@$(STEP) 'wasm compiler' sh -c './l8c3 wasm src2/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(OK)/wasm-fixpoint: $(BUILD)/l8.wasm $(WEB) | $(OK)
	@$(STEP) 'wasm fixpoint' sh -c 'node web/run.mjs $(BUILD)/l8.wasm wasm src2/main.l8 -o $(BUILD)/l8-self.wasm && cmp $(BUILD)/l8.wasm $(BUILD)/l8-self.wasm'
	@touch $@

# Compiler and callback fixtures built as modules.
$(OK)/wasm-tests: l8c3 $(TESTS) $(STDLIB) $(WEB) | $(OK)
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
WEB_FILES := web/index.html $(wildcard web/*.js web/examples/*.l8 web/game/* web/skate/* web/race/* web/cad/* web/recipes/* web/better/* web/people/*) programs/cad/handheld.pcb programs/cad/dock.pcb programs/recipes/recipes.txt programs/block-game/world.txt \
	programs/block-game/garden.txt

$(BUILD)/block-game.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'block game wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/block-game/block-game.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/skate.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'skate wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/skate/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/cad.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'cad wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/cad/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/recipes.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'recipes wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/recipes/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/better.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'better wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/better/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(BUILD)/race.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'race wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/race/main.l8 -o $@.tmp && mv -f $@.tmp $@'

$(OK)/web: $(BUILD)/l8.wasm $(BUILD)/block-game.wasm $(BUILD)/skate.wasm $(BUILD)/race.wasm $(BUILD)/cad.wasm $(BUILD)/recipes.wasm $(BUILD)/better.wasm $(WEB_FILES) $(STDLIB) | $(OK)
	@$(STEP) 'web site' sh -c 'rm -rf $(WEB_SITE) && mkdir -p $(WEB_SITE)/stdlib $(WEB_SITE)/examples $(WEB_SITE)/game $(WEB_SITE)/skate $(WEB_SITE)/race $(WEB_SITE)/cad $(WEB_SITE)/recipes $(WEB_SITE)/better $(WEB_SITE)/people && \
		cp web/index.html web/*.js $(WEB_SITE)/ && cp web/examples/*.l8 $(WEB_SITE)/examples/ && \
		cp $(STDLIB) $(WEB_SITE)/stdlib/ && cp $(BUILD)/l8.wasm $(WEB_SITE)/ && \
		cp web/game/* $(BUILD)/block-game.wasm programs/block-game/world.txt programs/block-game/garden.txt $(WEB_SITE)/game/ && \
		cp web/skate/* $(BUILD)/skate.wasm $(WEB_SITE)/skate/ && \
		cp web/race/* $(BUILD)/race.wasm $(WEB_SITE)/race/ && \
		cp web/cad/* $(BUILD)/cad.wasm programs/cad/handheld.pcb programs/cad/dock.pcb $(WEB_SITE)/cad/ && \
		cp web/recipes/* $(BUILD)/recipes.wasm programs/recipes/recipes.txt $(WEB_SITE)/recipes/ && \
		cp web/better/* $(BUILD)/better.wasm $(WEB_SITE)/better/ && \
		cp web/people/* $(WEB_SITE)/people/'
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
	@echo '  all (default)   format src2, then build apps and test the compiler'
	@echo '  check           build apps and test the compiler without formatting'
	@echo '  fmt             format src2 with the stage-2 compiler'
	@echo '  selfhost        build l8c1..l8c4, check the fixpoint, run compiler tests, install ./l8'
	@echo '  compiler-test   stage-1 fixtures, then all fixtures and CLI cram tests (tests/)'
	@echo '  game, skate, race, cad, recipes'
	@echo '  better, bible-web'
	@echo '  terminal, callback-test'
	@echo '  http, websocket, profile-explorer'
	@echo '  wasm-test       run the tests as WebAssembly under Node; check the wasm compiler fixpoint'
	@echo '  web             build the playground site in .build/web'
	@echo '  cad-boards      make the CAD board files again from their generators, routed'
	@echo '  promote, promote-bin1, promote-bin2, promote-source   (FORCE=1 skips the prompt)'
	@echo '  clean'
	@echo 'tools/profile.py times the compiler self-build, game build, and formatting.'

# ---- Lemma, the proof game (programs/lemma) ----
.PHONY: lemma lemma-web

check: $(BUILD)/lemma

LEMMA_FILES := programs/lemma/hol.txt $(wildcard programs/lemma/regions/*.txt)

$(BUILD)/lemma: l8c3 $(PROGRAMS) $(RUNTIME) | $(OK)
	@$(STEP) 'lemma' sh -c '$(call build,l8c3,programs/lemma/main.l8)'

lemma: $(BUILD)/lemma

# The page, put into the site `make web` makes (.build/web/lemma).
$(BUILD)/lemma.wasm: l8c3 $(PROGRAMS) | $(OK)
	@$(STEP) 'lemma wasm' sh -c './l8c3 wasm --async glXSwapBuffers programs/lemma/main.l8 -o $@.tmp && mv -f $@.tmp $@'

lemma-web: $(BUILD)/lemma.wasm $(wildcard web/lemma/*) $(LEMMA_FILES)
	@mkdir -p $(WEB_SITE)/lemma/regions
	@cp web/lemma/* $(BUILD)/lemma.wasm programs/lemma/hol.txt $(WEB_SITE)/lemma/
	@cp programs/lemma/regions/*.txt $(WEB_SITE)/lemma/regions/
