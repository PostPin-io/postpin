#!/usr/bin/env bash
# Sets up a self-hosted PostPin server: downloads compose.yml and the example configuration of
# the latest release, asks for the values only you know (hostnames, admin email, SMTP), generates
# the secrets, writes .env and starts PostPin.
#
#   curl -fsSLO https://github.com/PostPin-io/postpin/releases/latest/download/install.sh
#   bash install.sh [directory]          # default directory: ./postpin
#   bash install.sh --dry-run            # asks everything, writes into a temporary directory,
#                                        # shows the .env and starts nothing
#
# It never touches an existing .env. To change the configuration later, edit .env and run
# `docker compose up -d` again. See https://docs.postpin.io/self-hosting/installation
set -euo pipefail

RELEASE_URL=${POSTPIN_RELEASE_URL:-https://github.com/PostPin-io/postpin/releases/latest/download}
DOCS=https://docs.postpin.io/self-hosting

dry_run=false
dir=postpin
for arg in "$@"; do
	case $arg in
	--dry-run) dry_run=true ;;
	-h | --help)
		sed -nE '2,12s/^# ?//p' "$0"
		exit 0
		;;
	-*)
		printf 'Unknown option %s, see --help\n' "$arg" >&2
		exit 1
		;;
	*) dir=$arg ;;
	esac
done
# Run from a checkout of the repository: take compose.yml and .env.example next to the script
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)

bold=$'\e[1m' dim=$'\e[2m' red=$'\e[31m' green=$'\e[32m' reset=$'\e[0m'
if [[ ! -t 1 ]]; then bold='' dim='' red='' green='' reset=''; fi

say() { printf '%s\n' "$*"; }
fail() {
	printf '%sError:%s %s\n' "$red" "$reset" "$*" >&2
	exit 1
}
# A problem that stops the setup, but only warns in a dry run
check() {
	if $dry_run; then printf '%sWarning:%s %s\n' "$red" "$reset" "$*" >&2; else fail "$@"; fi
}

# Questions read from the terminal, so `curl … | bash` works too
if ! { exec 3</dev/tty; } 2>/dev/null; then exec 3<&0; fi

# ask VAR "Question" [default]
ask() {
	local __var=$1 question=$2 default=${3:-} answer
	if [[ -n $default ]]; then
		read -r -u 3 -p "$question ${dim}[$default]${reset}: " answer || true
		answer=${answer:-$default}
	else
		read -r -u 3 -p "$question: " answer || true
	fi
	printf -v "$__var" '%s' "$answer"
}

ask_secret() {
	local __var=$1 question=$2 answer
	read -r -s -u 3 -p "$question: " answer || true
	printf '\n'
	printf -v "$__var" '%s' "$answer"
}

# ask_yes "Question" → 0 for yes; default yes
ask_yes() {
	local answer
	read -r -u 3 -p "$1 ${dim}[Y/n]${reset}: " answer || true
	[[ -z $answer || $answer =~ ^[Yy] ]]
}

# "postpin.example.com" or "https://postpin.example.com/" → "https://postpin.example.com"
normalize_url() {
	local url=${1%/}
	[[ $url == http://* || $url == https://* ]] || url="https://$url"
	printf '%s' "$url"
}

host_of() {
	local host=${1#*://}
	printf '%s' "${host%%[/:]*}"
}

random_hex() {
	if command -v openssl >/dev/null; then
		openssl rand -hex "$1"
	else
		od -An -tx1 -N "$1" /dev/urandom | tr -d ' \n'
	fi
}

# Docker Compose reads .env: plain values as they are, anything else in single quotes
env_value() {
	if [[ $1 =~ ^[A-Za-z0-9_.@:/+=-]*$ ]]; then printf '%s' "$1"; else printf "'%s'" "$1"; fi
}

# set_env KEY value: replaces the line KEY=… in .env
set_env() {
	KEY=$1 VALUE=$(env_value "$2") awk '
		BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"] }
		index($0, key "=") == 1 { print key "=" value; found = 1; next }
		{ print }
		END { if (!found) print key "=" value }
	' .env >.env.tmp
	mv .env.tmp .env
}

# --- Checks --------------------------------------------------------------------------------------

say "${bold}PostPin setup${reset}"
$dry_run && say "${dim}Dry run: nothing gets installed or started.${reset}"
say ""

command -v curl >/dev/null || fail "curl is missing."
command -v docker >/dev/null || check "Docker is missing. Install Docker Engine first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || check "Docker Compose is missing. Install the Docker Compose plugin: https://docs.docker.com/compose/install/linux/"
docker info >/dev/null 2>&1 || check "Can't talk to Docker. Run this script as a user in the docker group, or with sudo."

[[ ! -e "$dir/.env" ]] || check "$dir/.env already exists. To change the configuration, edit it and run 'docker compose up -d' in $dir. Updates: $DOCS/updates"

if $dry_run; then
	say "Would install into ${bold}$dir${reset}"
	dir=$(mktemp -d)
	trap 'rm -rf "$dir"' EXIT
fi
mkdir -p "$dir"
cd "$dir"
$dry_run || say "Installing into ${bold}$(pwd)${reset}"
say ""

# --- Questions -----------------------------------------------------------------------------------

say "PostPin needs two hostnames that point to this server: one for the app and one for media"
say "storage, e.g. postpin.example.com and media.example.com. Your reverse proxy serves both with HTTPS."
say ""

while :; do
	ask app_url "App URL"
	[[ -n $app_url ]] && break
	say "${red}Please enter the hostname of the app.${reset}"
done
app_url=$(normalize_url "$app_url")
app_host=$(host_of "$app_url")

default_media="media.${app_host#*.}"
[[ $app_host == *.*.* ]] || default_media="media.$app_host"
ask media_url "Media URL" "https://$default_media"
media_url=$(normalize_url "$media_url")
[[ $(host_of "$media_url") != "$app_host" ]] || fail "The media URL needs its own hostname, not the one of the app."

say ""
while :; do
	ask admin_email "Your email address (gets access to the admin area)"
	[[ $admin_email == *@*.* ]] && break
	say "${red}Please enter a valid email address.${reset}"
done

say ""
say "PostPin sends email for verification, password resets and invitations. Without SMTP it"
say "still runs, but nobody can verify their address or reset a password."
ask smtp_host "SMTP server ${dim}(empty to skip)${reset}"
if [[ -n $smtp_host ]]; then
	ask smtp_port "SMTP port" 587
	smtp_secure=false
	[[ $smtp_port == 465 ]] && smtp_secure=true
	ask smtp_user "SMTP user"
	ask_secret smtp_password "SMTP password"
	ask smtp_from "Sender address" "${smtp_user:-noreply@$app_host}"
	[[ $smtp_from == *"<"* ]] || smtp_from="PostPin <$smtp_from>"
	if [[ $smtp_password == *"'"* || $smtp_user == *"'"* || $smtp_from == *"'"* ]]; then
		fail "Values with a single quote (') can't go into .env this way. Run the script again and leave SMTP empty, then fill it in .env by hand."
	fi
fi

# --- Files ---------------------------------------------------------------------------------------

say ""
if $dry_run && [[ -f $script_dir/compose.yml && -f $script_dir/.env.example ]]; then
	say "Taking compose.yml and .env.example from $script_dir …"
	cp "$script_dir/compose.yml" compose.yml
	cp "$script_dir/.env.example" .env
else
	say "Downloading compose.yml and env.example …"
	curl -fsSLO "$RELEASE_URL/compose.yml"
	curl -fsSL -o .env "$RELEASE_URL/env.example"
fi

set_env BETTER_AUTH_URL "$app_url"
set_env BETTER_AUTH_SECRET "$(random_hex 32)"
set_env ADMIN_EMAILS "$admin_email"
set_env POSTGRES_PASSWORD "$(random_hex 24)"
set_env S3_PUBLIC_ENDPOINT "$media_url"
set_env S3_ACCESS_KEY "$(random_hex 16)"
set_env S3_SECRET_KEY "$(random_hex 32)"
if [[ -n $smtp_host ]]; then
	set_env SMTP_HOST "$smtp_host"
	set_env SMTP_PORT "$smtp_port"
	set_env SMTP_SECURE "$smtp_secure"
	set_env SMTP_USER "$smtp_user"
	set_env SMTP_PASSWORD "$smtp_password"
	set_env SMTP_MAIL_FROM "$smtp_from"
else
	# SMTP_PORT stays as it is: an empty one doesn't pass the app's config check
	set_env SMTP_HOST ""
fi
chmod 600 .env # it holds the passwords
grep -q '=change-me$' .env && fail "Some values in .env are still 'change-me'. Please report this."
say "${green}✓${reset} Wrote .env with new secrets. Keep it safe, it holds the passwords."

if $dry_run; then
	say ""
	say "${bold}.env${reset} ${dim}(without comments and empty lines)${reset}"
	grep -vE '^[[:space:]]*(#|$)' .env
	say ""
	say "${bold}Next steps after a real run${reset}"
	say "  - Point your reverse proxy at both hostnames:"
	say "      $app_host → 127.0.0.1:3000"
	say "      $(host_of "$media_url") → 127.0.0.1:9000"
	say "  - Open $app_url, sign up with $admin_email and verify it."
	say ""
	say "Dry run done. Nothing was installed or started."
	exit 0
fi

# --- Start ---------------------------------------------------------------------------------------

say ""
started=false
if ask_yes "Start PostPin now?"; then
	docker compose pull --quiet
	docker compose up -d
	port=$(sed -nE 's/^APP_PORT=([0-9]+)/\1/p' .env)
	say "Waiting for PostPin to start …"
	for _ in $(seq 60); do
		if curl -fsS "http://127.0.0.1:${port:-3000}/health" >/dev/null 2>&1; then
			started=true
			break
		fi
		sleep 2
	done
	if $started; then
		say "${green}✓${reset} PostPin is running on http://127.0.0.1:${port:-3000}."
	else
		say "${red}PostPin didn't answer within two minutes.${reset} Check 'docker compose ps' and 'docker compose logs app'."
		say "Troubleshooting: $DOCS/troubleshooting"
	fi
fi

# --- Next steps ----------------------------------------------------------------------------------

say ""
say "${bold}Next steps${reset}"
$started || say "  - Start PostPin with 'docker compose up -d' in $(pwd)."
say "  - Point your reverse proxy at both hostnames:"
say "      $app_host → 127.0.0.1:3000"
say "      $(host_of "$media_url") → 127.0.0.1:9000"
say "    Examples for Caddy and nginx: $DOCS/reverse-proxy"
say "  - Open $app_url, sign up with $admin_email and verify it. The admin area is at /admin."
