#!/bin/bash

# TAP (Testing Assistant Project) Installation Script
# This script automatically detects your OS and architecture and downloads the appropriate binary

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="mzieniuk/tap"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="tap"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to detect OS and architecture
detect_platform() {
    local os=""
    local arch=""
    
    # Detect OS
    case "$(uname -s)" in
        Linux*)     os="linux";;
        Darwin*)    os="macos";;
        CYGWIN*|MINGW*|MSYS*) os="windows";;
        *)          print_error "Unsupported operating system: $(uname -s)"; exit 1;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64";;
        arm64|aarch64)  arch="arm64";;
        *)              print_error "Unsupported architecture: $(uname -m)"; exit 1;;
    esac
    
    echo "${os}-${arch}"
}

# Function to get latest release version
get_latest_version() {
    local version
    version=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
    
    if [[ -z "$version" ]]; then
        print_error "Failed to fetch latest version"
        exit 1
    fi
    
    echo "$version"
}

# Function to download and install binary
install_binary() {
    local platform="$1"
    local version="$2"
    local binary_suffix=""
    
    # Determine file extension and binary names based on platform
    case "$platform" in
        windows-*)
            binary_suffix=".exe"
            ;;
    esac
    
    local tap_binary="${BINARY_NAME}-${platform}${binary_suffix}"
    local tap_url="https://github.com/${REPO}/releases/download/${version}/${tap_binary}"
    
    print_status "Downloading TAP ${version} for ${platform}..."
    
    # Create temporary directory
    local temp_dir
    temp_dir=$(mktemp -d)
    
    # Download TAP binary
    print_status "Downloading ${tap_binary}..."
    if ! curl -fsSL "$tap_url" -o "${temp_dir}/${tap_binary}"; then
        print_error "Failed to download ${tap_binary}"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    
    # Check if we need sudo for installation
    if [[ ! -w "$INSTALL_DIR" ]]; then
        print_status "Installing to ${INSTALL_DIR} (requires sudo)..."
        SUDO="sudo"
    else
        print_status "Installing to ${INSTALL_DIR}..."
        SUDO=""
    fi
    
    # Install TAP binary
    $SUDO cp "${temp_dir}/${tap_binary}" "${INSTALL_DIR}/${BINARY_NAME}"
    $SUDO chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    
    
    # Clean up
    rm -rf "$temp_dir"
    
    print_success "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Function to verify installation
verify_installation() {
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        local version
        version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")
        print_success "TAP is installed and accessible: $version"
        
        print_status "Run 'tap setup' to configure your environment"
        print_status "Run 'tap --help' to see available commands"
        
    else
        print_warning "TAP installed but not found in PATH"
        print_status "You may need to add ${INSTALL_DIR} to your PATH or restart your shell"
        
        case "$SHELL" in
            */bash)
                print_status "For bash, add this to ~/.bashrc: export PATH=\"${INSTALL_DIR}:\$PATH\""
                ;;
            */zsh)
                print_status "For zsh, add this to ~/.zshrc: export PATH=\"${INSTALL_DIR}:\$PATH\""
                ;;
            */fish)
                print_status "For fish, run: fish_add_path ${INSTALL_DIR}"
                ;;
        esac
    fi
}

# Main installation function
main() {
    print_status "TAP (Testing Assistant Project) Installer"
    print_status "========================================="
    
    # Parse command line arguments
    local custom_version=""
    local custom_dir=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version)
                custom_version="$2"
                shift 2
                ;;
            --install-dir)
                custom_dir="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --version VERSION     Install specific version"
                echo "  --install-dir DIR     Install to custom directory (default: /usr/local/bin)"
                echo "  --help                Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                                    # Install latest version"
                echo "  $0 --version v1.1.0                  # Install specific version"
                echo "  $0 --install-dir ~/.local/bin        # Install to custom directory"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Use custom install directory if provided
    if [[ -n "$custom_dir" ]]; then
        INSTALL_DIR="$custom_dir"
        mkdir -p "$INSTALL_DIR"
    fi
    
    # Detect platform
    local platform
    platform=$(detect_platform)
    print_status "Detected platform: $platform"
    
    # Get version to install
    local version
    if [[ -n "$custom_version" ]]; then
        version="$custom_version"
        print_status "Installing requested version: $version"
    else
        version=$(get_latest_version)
        print_status "Latest version: $version"
    fi
    
    # Install the binary
    install_binary "$platform" "$version"
    
    # Verify installation
    verify_installation
    
    print_success "Installation complete! 🎉"
}

# Run main function with all arguments
main "$@"