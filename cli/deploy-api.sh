#!/bin/bash
#
# deploy-api.sh - Deploy finance API to database server
#
# Usage:
#   ./cli/deploy-api.sh [command] [options]
#
# Commands:
#   (default)     Full deploy: push + pull + install + restart + verify
#   status        Check commit parity, PM2 health, API health (read-only)
#   restart       Restart finance-api PM2 process
#   verify        Check PM2 status and API health only
#   logs          Tail finance-api logs
#   setup         First-time setup: start PM2 process and save
#
# Options:
#   --dry-run       Show actions without executing
#   --skip-install  Skip install detection during full deploy
#   --skip-verify   Skip post-deploy verification
#   --force-install Force yarn install regardless of changes
#   -h, --help      Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FINANCE_DIR="$(dirname "$SCRIPT_DIR")"
REMOTE_HOST="database"
REMOTE_DIR="/home/user/projects/finance"
REMOTE_PORT=8086
PM2_NAME="finance-api"
SSH_CONTROL_PATH="/tmp/finance-deploy-ssh-%r@%h:%p"

REMOTE_ENV="export NVM_DIR=/home/user/.nvm && source /home/user/.nvm/nvm.sh && cd $REMOTE_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
DRY_RUN=false
SKIP_INSTALL=false
SKIP_VERIFY=false
FORCE_INSTALL=false
COMMAND=""

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${BLUE}[STEP]${NC} $1"; }

usage() {
    head -22 "$0" | tail -20
    exit 0
}

ssh_cmd() {
    ssh -o ControlMaster=auto -o ControlPath="$SSH_CONTROL_PATH" -o ControlPersist=60 "$REMOTE_HOST" "$@"
}

ssh_or_dry() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} ssh $REMOTE_HOST \"$*\""
    else
        ssh_cmd "$@"
    fi
}

run_or_dry() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

check_connectivity() {
    if ! ssh -o ConnectTimeout=5 "$REMOTE_HOST" "echo ok" > /dev/null 2>&1; then
        log_error "Cannot connect to $REMOTE_HOST"
        exit 1
    fi
    log_info "Connected to $REMOTE_HOST"
    echo ""
}

# --- setup command (first-time) ---
do_setup() {
    log_step "Checking CONFIG_ENCRYPTION_KEY..."
    HAS_KEY=$(ssh_cmd "$REMOTE_ENV && test -n \"\$CONFIG_ENCRYPTION_KEY\" && echo yes || echo no")
    if [ "$HAS_KEY" != "yes" ]; then
        log_error "CONFIG_ENCRYPTION_KEY is not set on $REMOTE_HOST"
        log_error "Set it in /etc/environment and reboot, or export it in the current shell"
        exit 1
    fi
    log_info "CONFIG_ENCRYPTION_KEY is set"

    log_step "Checking config file..."
    HAS_CONFIG=$(ssh_cmd "test -f $REMOTE_DIR/config/config.json && echo yes || echo no")
    if [ "$HAS_CONFIG" != "yes" ]; then
        log_error "No config.json found at $REMOTE_DIR/config/"
        exit 1
    fi
    log_info "Config file exists"

    log_step "Starting $PM2_NAME via PM2..."
    ssh_or_dry "$REMOTE_ENV && NODE_ENV=production pm2 start server.mjs --name $PM2_NAME --node-args='--max-old-space-size=512' && pm2 save"
    echo ""

    sleep 3
    do_verify
}

# --- restart command ---
do_restart() {
    log_step "Restarting $PM2_NAME..."
    ssh_or_dry "$REMOTE_ENV && pm2 restart $PM2_NAME"
    echo ""
}

# --- verify command ---
do_verify() {
    local PASS=0
    local FAIL=0

    log_step "Checking PM2 process..."
    STATUS=$(ssh_cmd "$REMOTE_ENV && pm2 jlist 2>/dev/null" | jq -r ".[] | select(.name==\"$PM2_NAME\") | .pm2_env.status" 2>/dev/null || echo "not found")
    if [ "$STATUS" = "online" ]; then
        log_info "$PM2_NAME: online"
        PASS=$((PASS + 1))
    else
        log_warn "$PM2_NAME: $STATUS"
        FAIL=$((FAIL + 1))
    fi

    log_step "Checking API endpoint..."
    HTTP_CODE=$(ssh_cmd "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:$REMOTE_PORT/api/connections?publicKey=test" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log_info "API responding (HTTP $HTTP_CODE)"
        PASS=$((PASS + 1))
    else
        log_warn "API returned HTTP $HTTP_CODE"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    echo "=================================="
    if [ "$FAIL" -eq 0 ]; then
        log_info "$PASS/$((PASS + FAIL)) checks passed"
    else
        log_warn "$PASS/$((PASS + FAIL)) checks passed ($FAIL failed)"
    fi
    echo "=================================="
}

# --- status command ---
do_status() {
    echo "=================================="
    echo "Finance API Status"
    echo "=================================="
    echo ""

    log_step "Commit parity..."
    LOCAL_HEAD=$(git -C "$FINANCE_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
    REMOTE_HEAD=$(ssh_cmd "cd $REMOTE_DIR && git rev-parse HEAD 2>/dev/null" || echo "unknown")
    LOCAL_SHORT="${LOCAL_HEAD:0:7}"
    REMOTE_SHORT="${REMOTE_HEAD:0:7}"
    if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
        log_info "Finance: $LOCAL_SHORT (in sync)"
    else
        log_warn "Finance: local=$LOCAL_SHORT remote=$REMOTE_SHORT (out of sync)"
    fi
    echo ""

    do_verify
}

# --- logs command ---
do_logs() {
    ssh_cmd "$REMOTE_ENV && pm2 logs $PM2_NAME --lines 50"
}

# --- full deploy (default) ---
do_deploy() {
    echo "=================================="
    echo "Finance API Deploy"
    echo "=================================="
    echo "Local:  $FINANCE_DIR"
    echo "Remote: $REMOTE_HOST:$REMOTE_DIR"
    [ "$DRY_RUN" = true ] && echo -e "${YELLOW}Mode: DRY RUN${NC}"
    echo ""

    # Step 1: Push to GitHub
    log_step "Pushing to origin..."
    if ! run_or_dry git -C "$FINANCE_DIR" push origin main 2>/dev/null; then
        log_warn "Nothing to push or push failed"
    fi
    echo ""

    # Step 2: Pull on remote
    log_step "Recording remote HEAD before pull..."
    BEFORE_HEAD=$(ssh_cmd "cd $REMOTE_DIR && git rev-parse HEAD")

    log_step "Pulling latest code on remote..."
    ssh_or_dry "cd $REMOTE_DIR && git pull origin main"

    AFTER_HEAD=$(ssh_cmd "cd $REMOTE_DIR && git rev-parse HEAD")
    echo ""

    # Step 3: Conditional install
    if [ "$FORCE_INSTALL" = true ]; then
        log_step "Forced yarn install..."
        ssh_or_dry "$REMOTE_ENV && yarn install"
        echo ""
    elif [ "$SKIP_INSTALL" = false ] && [ "$BEFORE_HEAD" != "$AFTER_HEAD" ]; then
        DEPS_CHANGED=$(ssh_cmd "cd $REMOTE_DIR && git diff $BEFORE_HEAD..$AFTER_HEAD --name-only | grep -E '^package\.json$|^yarn\.lock$'" || true)
        if [ -n "$DEPS_CHANGED" ]; then
            log_step "Dependencies changed, running yarn install..."
            ssh_or_dry "$REMOTE_ENV && yarn install"
            echo ""
        fi
    fi

    # Step 4: Restart PM2
    do_restart

    # Step 5: Verify
    if [ "$SKIP_VERIFY" = false ]; then
        sleep 3
        do_verify
    else
        echo "=================================="
        log_info "Deploy complete (verification skipped)"
        echo "=================================="
    fi
}

# --- Parse arguments ---
for arg in "$@"; do
    case "$arg" in
        -*)
            continue ;;
        status|restart|verify|logs|setup)
            COMMAND="$arg"
            break ;;
    esac
done

while [[ $# -gt 0 ]]; do
    case $1 in
        status|restart|verify|logs|setup)
            shift ;;
        --dry-run)
            DRY_RUN=true; shift ;;
        --skip-install)
            SKIP_INSTALL=true; shift ;;
        --skip-verify)
            SKIP_VERIFY=true; shift ;;
        --force-install)
            FORCE_INSTALL=true; shift ;;
        -h|--help)
            usage ;;
        *)
            log_error "Unknown option: $1"
            echo "Run with --help for usage information."
            exit 1 ;;
    esac
done

# --- Cleanup SSH control socket on exit ---
cleanup() {
    ssh -O exit -o ControlPath="$SSH_CONTROL_PATH" "$REMOTE_HOST" 2>/dev/null || true
}
trap cleanup EXIT

# --- Execute command ---
case "${COMMAND:-deploy}" in
    setup)
        check_connectivity
        do_setup ;;
    status)
        check_connectivity
        do_status ;;
    restart)
        check_connectivity
        do_restart
        log_info "Restart complete." ;;
    verify)
        check_connectivity
        do_verify ;;
    logs)
        check_connectivity
        do_logs ;;
    deploy)
        check_connectivity
        do_deploy ;;
esac
