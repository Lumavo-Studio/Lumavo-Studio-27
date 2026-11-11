#!/bin/bash
cd "$(dirname "$0")"
echo "Welchen Mac hast du?"
echo "  1) Apple Silicon (M1, M2, M3, M4)"
echo "  2) Intel"
read -p "Deine Wahl: " c
if [ "$c" = "2" ]; then A=x64; else A=arm64; fi
export npm_config_arch=$A CSC_IDENTITY_AUTO_DISCOVERY=false
command -v node >/dev/null || { echo "Bitte zuerst Node.js von https://nodejs.org installieren."; exit 1; }
rm -rf node_modules/ffmpeg-static
npm install && npx electron-builder --mac --$A --publish never && open dist
