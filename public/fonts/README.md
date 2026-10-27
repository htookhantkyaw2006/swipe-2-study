# Application fonts

Self-hosted WOFF2 variable fonts distributed through Fontsource. The existing Inter and JetBrains Mono typefaces are retained; Noto Sans provides Burmese and CJK glyph coverage.

- `@fontsource-variable/inter@5.3.0` (3 normal-style Unicode subsets)
- `@fontsource-variable/noto-sans-myanmar@5.3.0` (1 normal-style Unicode subsets)
- `@fontsource-variable/noto-sans-sc@5.3.1` (101 normal-style Unicode subsets)
- `@fontsource-variable/noto-sans-jp@5.3.1` (124 normal-style Unicode subsets)
- `@fontsource-variable/jetbrains-mono@5.3.0` (3 normal-style Unicode subsets)

Each family includes its original license. `fonts.css` preserves Unicode ranges and variable weight ranges so browsers request only subsets needed by displayed text. Latin, Latin Extended, and Vietnamese subsets cover the Latin UI, pinyin and reading marks. No third-party font request is required at runtime.

Source: https://fontsource.org/ and the package names/versions above.
