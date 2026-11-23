---
"@postpin-io/postpin": minor
---

feat: on the first visit to a timeline's export list, members without a signed-in plugin are asked whether to install a plugin and pick DaVinci Resolve, Premiere Pro or Pro Tools, which starts its install tutorial; "No, thanks" skips them after one confirmation. The install tutorials now need the Member role, since reviewers can't sign in a plugin. The first-upload tutorial creates the first organization itself instead of the dashboard's plain dialog, and only shows the steps the user actually does. Fixed: after signing up, the first tutorial sometimes didn't start and "Get started" did nothing until a reload. The sign-in pages got a cleaner card with the logo, consistent headings and fields, and the email and password form now comes before SSO and passkeys.
