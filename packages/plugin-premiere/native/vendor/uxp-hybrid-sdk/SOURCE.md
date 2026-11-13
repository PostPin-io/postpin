# UXP Hybrid Plugin SDK (vendored subset)

The four files next to this one are Adobe's UXP Hybrid Plugin SDK, copied **unchanged** (byte for
byte) and flattened into one folder:

| File here          | In the SDK                   | What it is                                                          |
| ------------------ | ---------------------------- | ------------------------------------------------------------------- |
| `UxpAddonTypes.h`  | `src/api/UxpAddonTypes.h`    | Opaque types: `addon_env`, `addon_value`, `addon_status`, ...       |
| `UxpAddonShared.h` | `src/api/UxpAddonShared.h`   | The C API table `addon_apis` (Node-API-like functions)              |
| `UxpAddon.h`       | `src/utilities/UxpAddon.h`   | `UXP_ADDON_INIT` / `UXP_ADDON_TERMINATE`, the global `UxpAddonApis` |
| `UxpAddon.cpp`     | `src/utilities/UxpAddon.cpp` | Implementation of the two entry points the macros declare           |

The Rust addon (`native/`) reads only the two `api` headers, through bindgen in `build.rs`. The two
`utilities` files are the C++ way to write the entry points; Rust exports them itself, so they can
be dropped.

Not copied, because the addon doesn't use them: `src/utilities/UxpValue.{h,cpp}` (C++ value
wrappers), `src/utilities/UxpTask.{h,cpp}` (scheduling between the main and the scripting thread),
the templates and the README images.

## Version

- SDK version `0.1.0` (`HYBRID_PLUGIN_SDK_VERSION` in `UxpAddonShared.h`)
- Downloaded from Adobe on 2026-11-13 as `uxp-hybrid-plugin-sdk.zip` (a GitHub archive of the
  `main` branch; the archive comment names commit `96099f4b36d9cc69429fcd2a07af20f93d9632dd`, the
  files are dated 2026-03-31)
- SHA-256 of that zip: `8c7469c5108f4f768fdedf5c7e9ac8567f3d98f610a62d94dae798030d9841a9`
- Documentation: https://developer.adobe.com/premiere-pro/uxp/plugins/hybrid-plugins/

To update: download the SDK again, compare `HYBRID_PLUGIN_SDK_VERSION`, copy the four files over
these ones and update this section. Keep them unchanged, so a diff against a new SDK shows only
Adobe's changes.

## What the SDK README says that matters here

- Hybrid plugins need Premiere Pro **26.2** or newer (`host.minVersion`), manifest version 6, the
  `addon` field and the `enableAddon` permission.
- The plugin must contain the addon as `mac/arm64/`, `mac/x64/` and `win/x64/<name>.uxpaddon`,
  otherwise UDT rejects it with "Plugin Manifest Validation Failed". A subset of the architectures
  is allowed for local development and independent distribution; Adobe Marketplace submission
  needs all three.
- The init and terminate routines run on the host's main thread, calls from JavaScript on a
  separate scripting thread. `addon_env` and `addon_value` are only valid on the scripting thread.

## License

The files carry Adobe's notice ("Copyright 2022 Adobe. All Rights Reserved. ... in accordance with
the terms of the Adobe license agreement accompanying it"). The agreement that comes with the SDK is
`Adobe-Developer-Additional-Terms_en-US_20220330.pdf` (Adobe Developer Terms of Use, March 30, 2022),
not copied here. Section 4.3 requires keeping Adobe's notices in every copy; the files are unchanged,
so they are.

**Committed on purpose (decided 2026-11-13).** Section 4.1 (B) of those terms licenses distributing
the Developer Tools "solely in and with your approved Developer Software in object code form only",
which read literally doesn't cover headers in a public repository. Other open-source hybrid plugin
projects publish the same headers, e.g.
[hyperbrew/bolt-uxp](https://github.com/hyperbrew/bolt-uxp/tree/main/src/hybrid/src/api) (MIT, public),
so they're committed here as well, unchanged and with Adobe's notices. Should Adobe object, remove
them from the repository and let CI fetch the SDK from a private place instead (a repository secret
with the zip, checked against the SHA-256 above); `build.rs` already reads `UXP_HYBRID_SDK`.
