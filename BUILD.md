# Build and Release Guide

This document explains how to build and release TAP executables for multiple platforms.

## Quick Start

### Local Development Build
```bash
# Build for current platform
bun run build        # Build TAP executable
bun run build:all    # Build executable
```

### Cross-Platform Builds
```bash
# Build for specific platforms
bun run build:linux        # Linux x64 + ARM64
bun run build:windows      # Windows x64 + baseline
bun run build:macos        # macOS x64 + ARM64

# Build all cross-platform executables
bun run build:all:cross    # All platforms
```

## Automated Release Process

### Creating a Release

1. **Update version** in `package.json`
2. **Commit changes** and push to main
3. **Create and push a tag**:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. **GitHub Actions** automatically:
   - Builds executables for all platforms
   - Creates a GitHub release
   - Attaches all binaries and checksums

### Supported Platforms

| Platform | Architecture | File Name | Notes |
|----------|--------------|-----------|-------|
| Linux | x64 | `tap-linux-x64` | Modern CPUs |
| Linux | ARM64 | `tap-linux-arm64` | ARM processors |
| Windows | x64 | `tap-windows-x64.exe` | Modern CPUs (2013+) |
| Windows | x64 Baseline | `tap-windows-x64-baseline.exe` | Older CPUs (pre-2013) |
| macOS | x64 | `tap-macos-x64` | Intel Macs |
| macOS | ARM64 | `tap-macos-arm64` | Apple Silicon Macs |

Each platform includes the `tap` main CLI executable.

## Installation Methods

### 1. Automatic Installation (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/mzieniuk/tap/main/install.sh | bash
```

### 2. Manual Installation
1. Download the appropriate binary from [Releases](https://github.com/mzieniuk/tap/releases)
2. Make executable: `chmod +x tap-*`
3. Move to PATH: `sudo mv tap-* /usr/local/bin/tap`

### 3. Custom Installation Directory
```bash
curl -fsSL https://raw.githubusercontent.com/mzieniuk/tap/main/install.sh | bash -s -- --install-dir ~/.local/bin
```

## Build Configuration

### GitHub Actions Workflow
- **File**: `.github/workflows/build-release.yml`
- **Triggers**: Tags (`v*`), manual dispatch, pull requests
- **Matrix builds** across all supported platforms
- **Artifact retention**: 30 days for non-release builds

### Build Scripts
All build scripts are defined in `package.json`:
- Cross-compilation uses Bun's `--target` flag
- Executables include full runtime (no dependencies)
- File sizes typically 50-100MB per executable

## Release Assets

Each release includes:
- **Executables**: All platform-specific binaries
- **Checksums**: SHA256 hashes for verification
- **Build info**: Version, target, build date

## Verification

### Verify Installation
```bash
tap --version
```

### Verify Checksums
```bash
# Download checksums.txt from release
sha256sum -c checksums.txt
```

## Development Notes

- **Bun Version**: Latest version (1.2.0+ minimum for cross-compilation)
- **Build time**: ~2-3 minutes for all platforms
- **Bundle size**: Includes all dependencies and runtime
- **No dependencies**: Executables run standalone without Node.js/Bun

## Troubleshooting

### Build Issues
- Ensure latest Bun version is installed (1.2.0+ minimum)
- Check TypeScript compilation: `bun x tsc --noEmit`
- Verify all dependencies are installed: `bun install`

### Runtime Issues
- **"Illegal instruction" on Linux/Windows**: Use baseline build for older CPUs
- **Permission denied**: Make file executable with `chmod +x`
- **Command not found**: Ensure binary is in PATH