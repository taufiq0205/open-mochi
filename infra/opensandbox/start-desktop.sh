#!/bin/bash
set -euo pipefail
umask 077
printf '%s' "${VNC_PASSWORD:?VNC_PASSWORD is required}" > /home/desktop/.vnc-password
x11vnc -storepasswd "$VNC_PASSWORD" /home/desktop/.vnc-auth >/dev/null
unset VNC_PASSWORD
Xvfb :0 -screen 0 1280x800x24 -nolisten tcp &
for attempt in {1..50}; do
  if xdpyinfo -display :0 >/dev/null 2>&1; then break; fi
  sleep 0.1
done
xdpyinfo -display :0 >/dev/null
DISPLAY=:0 dbus-launch startxfce4 >/tmp/desktop-session.log 2>&1 &
x11vnc -display :0 -rfbauth /home/desktop/.vnc-auth -localhost -forever -shared -rfbport 5900 >/tmp/desktop-vnc.log 2>&1 &
exec websockify --web=/usr/share/novnc 6080 localhost:5900
