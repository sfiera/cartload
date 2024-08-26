NODE_OPTIONS := "$(NODE_OPTIONS) --experimental-vm-modules"

.PHONY: serve
serve:
	python3 -m http.server -d src

.PHONY: test
test:
	NODE_OPTIONS=$(NODE_OPTIONS) npm test
