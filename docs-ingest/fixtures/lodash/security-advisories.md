# Lodash — Known Security Advisories Affecting Versions ≤ 4.17.20

This document summarises the public security advisories published for the
`lodash` npm package that affect versions `4.17.20` and earlier. Versions
`4.17.21` and later contain fixes for all advisories listed here.

## CVE-2021-23337 — Command Injection in `template`

GHSA: GHSA-35jh-r3h4-6jhm. Affects `lodash` versions prior to `4.17.21`.

The `lodash.template` function builds a JavaScript function from an unsanitised
template string. When a template includes user-controlled values inside an
`<%= %>` or `<% %>` interpolation, an attacker can inject arbitrary JavaScript
that executes inside the template compiler. This allows command execution in
the Node.js process running the template.

Applications **must** upgrade `lodash` to `4.17.21` or later. Applications
**must not** call `_.template(userInput)` directly when any portion of the
template string is sourced from user input. Applications **should** prefer a
templating library that compiles templates at build time rather than at request
time.

## CVE-2020-8203 — Prototype Pollution in `zipObjectDeep` and Friends

GHSA: GHSA-p6mc-m468-83gw. Affects `lodash` versions prior to `4.17.20` for
`zipObjectDeep`; the same root cause is patched across `mergeWith`, `defaultsDeep`,
and `merge` in earlier releases. Code using `4.17.20` is patched for the original
report but the surrounding family of functions remains hazardous when fed
attacker-controlled key paths.

The vulnerability allows an attacker to inject properties onto
`Object.prototype` by passing key paths such as `__proto__.polluted` to the
affected functions. Once polluted, every plain object in the process inherits
the attacker-controlled property, which can bypass authorisation checks or
crash the application.

Applications **must not** pass user-controlled key paths to `_.zipObjectDeep`,
`_.mergeWith`, `_.defaultsDeep`, or `_.merge`. Applications **must** validate
and reject any key path containing the segments `__proto__`, `constructor`, or
`prototype` before invoking these helpers.

## General Maintenance Posture

The lodash maintainers have publicly stated that the project is in maintenance
mode and that new security work prioritises the published patched versions
rather than new releases. Long-term, applications **should** plan to migrate
off lodash for security-sensitive utility code, preferring the standard
library's structured-clone, `Object.fromEntries`, and modern array methods.

Applications that pin to `lodash@4.17.20` exactly **must** also include a
package-overrides entry forcing all transitive dependencies onto `4.17.21` or
later, otherwise an unrelated upgrade can silently reintroduce the vulnerable
version through a transitive dependency.
