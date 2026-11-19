# Login shells: load the normal profile, then put Node 24 first.
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
