class GitContext < Formula
  desc "CLI tool that gathers and structures repository context for AI-powered code reviews"
  homepage "https://github.com/yaseen-vm/git-context"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yaseen-vm/git-context/releases/download/v#{version}/git-context-macos-arm64"
      sha256 "PLACEHOLDER_SHA256_MACOS_ARM64"

      def install
        bin.install "git-context-macos-arm64" => "git-context"
      end
    else
      url "https://github.com/yaseen-vm/git-context/releases/download/v#{version}/git-context-macos-x64"
      sha256 "PLACEHOLDER_SHA256_MACOS_X64"

      def install
        bin.install "git-context-macos-x64" => "git-context"
      end
    end
  end

  on_linux do
    url "https://github.com/yaseen-vm/git-context/releases/download/v#{version}/git-context-linux-x64"
    sha256 "PLACEHOLDER_SHA256_LINUX_X64"

    def install
      bin.install "git-context-linux-x64" => "git-context"
    end
  end

  test do
    assert_match "git-context", shell_output("#{bin}/git-context --version")
  end
end
