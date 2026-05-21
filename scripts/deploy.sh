#!/bin/bash
# iProTalk Premium Deployment Orchestrator
# A beautiful, multi-mode deployment suite for building and starting iProTalk.

set -euo pipefail

# Style definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Determine script & project roots
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

print_header() {
    clear
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${PURPLE}                  iProTalk Deploy Orchestrator                  ${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶ $1...${NC}"
}

print_success() {
    echo -e "${GREEN}✔ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}✘ $1${NC}"
}

check_dependency() {
    local cmd=$1
    local name=$2
    if ! command -v "$cmd" &> /dev/null; then
        print_error "Dependency '$name' ($cmd) is missing!"
        return 1
    fi
    return 0
}

ensure_env_file() {
    if [ ! -f ".env" ]; then
        print_warning ".env file not found. Initializing from .env.example..."
        cp .env.example .env
        # Generate a random secret key for security
        local rand_secret=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 || echo "some-very-secure-secret-key-32-chars")
        # Replace template secret
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/your-secure-random-string-here/$rand_secret/g" .env
        else
            sed -i "s/your-secure-random-string-here/$rand_secret/g" .env
        fi
        print_success ".env initialized successfully! Please review port configurations."
    else
        print_success ".env file exists"
    fi
}

load_env() {
    ensure_env_file
    export $(grep -v '^#' .env | xargs)
}

build_frontend() {
    print_header
    print_step "Checking frontend dependencies"
    check_dependency "npm" "Node Package Manager"
    
    print_step "Installing frontend dependencies"
    cd "$PROJECT_DIR/web-client"
    npm install
    print_success "Dependencies installed"

    print_step "Compiling highly optimized frontend production bundle"
    npm run build
    print_success "Production bundle compiled"

    print_step "Synchronizing compiled assets to backend static asset directory"
    rm -rf "$PROJECT_DIR/static/assets"
    mkdir -p "$PROJECT_DIR/static"
    cp -R "$PROJECT_DIR/web-client/dist/"* "$PROJECT_DIR/static/"
    print_success "Production assets synchronized"
    
    cd "$PROJECT_DIR"
}

build_backend_native() {
    print_header
    print_step "Checking Rust compiler environment"
    check_dependency "cargo" "Rust Cargo Package Manager"

    print_step "Building backend Poem release binary"
    cargo build --release
    print_success "Backend release binary built successfully"
}

start_native() {
    load_env
    local port=${PORT:-3002}
    print_header
    echo -e "${GREEN}🚀 Launching iProTalk Native Service...${NC}"
    echo -e "   - Bind Address : http://0.0.0.0:$port"
    echo -e "   - Log Level    : ${RUST_LOG:-info}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop the server.${NC}"
    echo -e "${CYAN}----------------------------------------------------------------${NC}"
    
    # Run the native release binary
    ./target/release/ipro-talk
}

run_docker_compose() {
    print_header
    print_step "Checking Docker environment"
    check_dependency "docker" "Docker Daemon"
    check_dependency "docker-compose" "Docker Compose"

    print_step "Launching iProTalk containers using Docker Compose"
    docker-compose up --build -d
    
    print_success "Containers started in background!"
    echo ""
    docker-compose ps
}

# --- Main Flow Choice ---
print_header
echo -e "Choose your preferred deployment strategy:"
echo -e "  ${GREEN}1)${NC} Native Deployment (Build frontend + Compile native Rust release)"
echo -e "  ${GREEN}2)${NC} Docker Compose Deployment (Build & run inside containers)"
echo -e "  ${GREEN}3)${NC} Frontend Build & Sync Only (Sync UI modifications)"
echo -e "  ${GREEN}4)${NC} Native Quick-Start (Run pre-compiled binary)"
echo -e "  ${GREEN}5)${NC} Exit"
echo ""
read -rp "Enter choice [1-5]: " deploy_mode

case "$deploy_mode" in
    1)
        load_env
        build_frontend
        build_backend_native
        
        echo ""
        echo -e "${GREEN}🎉 NATIVE BUILD COMPLETE!${NC}"
        read -rp "Would you like to start the server now? [y/N]: " start_now
        if [[ "$start_now" =~ ^[Yy]$ ]]; then
            start_native
        else
            echo -e "\nTo start the server manually, run:"
            echo -e "  ${CYAN}./target/release/ipro-talk${NC}"
        fi
        ;;
    2)
        load_env
        run_docker_compose
        ;;
    3)
        build_frontend
        echo -e "\n${GREEN}🎉 Frontend rebuild and static sync completed successfully!${NC}"
        ;;
    4)
        if [ ! -f "./target/release/ipro-talk" ]; then
            print_error "Pre-compiled binary not found at ./target/release/ipro-talk. Please run Option 1 first."
            exit 1
        fi
        start_native
        ;;
    5)
        echo -e "\n${YELLOW}Deployment cancelled.${NC}"
        exit 0
        ;;
    *)
        print_error "Invalid selection."
        exit 1
        ;;
esac
