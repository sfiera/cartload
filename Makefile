.PHONY: test
test:
	npm test

.PHONY: serve
serve:
	python3 -m http.server -d src
