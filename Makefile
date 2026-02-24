.PHONY: build publish clean

build:
	@echo "Building miqro..."
	npm run build

publish: build
	@echo "Publishing to npm..."
	npm publish --access public

clean:
	@echo "Cleaning dist directory..."
	rm -rf dist
