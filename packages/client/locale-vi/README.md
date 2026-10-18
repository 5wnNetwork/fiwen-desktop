# @deepseek-ai/dsh-client-locale-vi

Vietnamese (Tiếng Việt) language pack for the DSH client. The browser plugin
adds `vi` to the selectable-language catalog — falling back to English — and
registers one Vietnamese dictionary for every locale namespace shipped by the
client plugins in this workspace.

## Model experience

This package contributes no model-visible input, tools, or session events; it
changes only rendered interface copy. Token and KV-cache impact: none.

## Behavior

- `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })`
  makes Vietnamese selectable in Settings → Language.
- `ctx.locale.register(ns, 'vi', dict)` supplies Vietnamese text for each of
  the namespaces in `src/locales/index.ts` (`VI_DICTIONARIES`). Keys missing a
  Vietnamese string resolve through the `vi → en` fallback chain.
- Each dictionary is typed `satisfies Partial<Record<UpstreamKey, string>>`, so
  extra or mistyped keys fail typecheck while new upstream keys compile until
  the coverage test reports them untranslated.
- `tests/coverage.spec.ts` fails on any English key without a Vietnamese entry
  and on any `{placeholder}` drift between the English and Vietnamese strings.

## Known Limitations and Deferred Work

- The `directory-browser` namespace keeps its upstream dictionaries inline in
  its `apply`; the coverage test reads its English key set out of that source
  file rather than importing a shared constant.
