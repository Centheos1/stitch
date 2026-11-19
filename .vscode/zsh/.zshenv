# Workspace-only zsh config (selected via ZDOTDIR in .vscode/settings.json).
# Keeps the shared history file in the usual place.
export HISTFILE="$HOME/.zsh_history"

[ -f "$HOME/.zshenv" ] && source "$HOME/.zshenv"
