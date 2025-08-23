class Tap < Formula
  desc "Testing Assistant Project - AI-powered test generation from GitHub PRs and Jira tickets"
  homepage "https://github.com/mzieniuk/tap"
  version "1.0.0"
  
  on_macos do
    on_arm do
      url "https://github.com/mzieniuk/tap/releases/download/v#{version}/tap-macos-arm64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_ARM64"
    end
    on_intel do
      # Intel Macs can use the ARM64 binary with Rosetta
      url "https://github.com/mzieniuk/tap/releases/download/v#{version}/tap-macos-arm64"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_FOR_ARM64"
    end
  end

  def install
    bin.install "tap-macos-arm64" => "tap"
  end

  test do
    system "#{bin}/tap", "--help"
  end
end