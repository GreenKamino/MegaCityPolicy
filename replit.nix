{pkgs}: {
  deps = [
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libxcb
    pkgs.xorg.libX11
    pkgs.pango
    pkgs.libxkbcommon
    pkgs.libdrm
    pkgs.gtk3
    pkgs.expat
    pkgs.dbus
    pkgs.cups
    pkgs.cairo
    pkgs.at-spi2-core
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.alsa-lib
    pkgs.nspr
    pkgs.nss
    pkgs.libgbm
    pkgs.mesa
    pkgs.xvfb-run
  ];
}
