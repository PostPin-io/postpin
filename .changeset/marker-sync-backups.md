---
"@postpin-io/postpin": minor
"@postpin-io/shared": minor
"@postpin-io/api-client-ts": minor
"@postpin-io/plugin-core": minor
"@postpin-io/plugin-electron": minor
"@postpin-io/resolve-plugin": minor
"@postpin-io/premiere-plugin": minor
"@postpin-io/desktop": minor
---

feat: marker sync only writes what changed since the last sync, keeps changes made on the other side, asks before deleting markers deleted on one side, and backs up the markers before every push, pull and delete all; the plugins' new History undoes an action. Plugins need API version 2.
