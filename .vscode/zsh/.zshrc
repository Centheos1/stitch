# Interactive shells: load the normal config, then put Node 24 first again,
# because conda and other tools prepend their own paths.
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"

export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
