#!/bin/bash

set -e

# Start Xvfb
echo "Starting Xvfb..."
Xvfb ${DISPLAY} -screen 0 ${VNC_RESOLUTION}x${VNC_COL_DEPTH} &
sleep 2

# Start VNC server
echo "Starting VNC server..."
vncserver ${DISPLAY} -geometry ${VNC_RESOLUTION} -depth ${VNC_COL_DEPTH} -SecurityTypes None --I-KNOW-THIS-IS-INSECURE -xstartup /usr/bin/startxfce4 &
sleep 2

# Start noVNC
echo "Starting noVNC on port ${NO_VNC_PORT}..."
/opt/noVNC/utils/novnc_proxy --vnc localhost:${VNC_PORT} --listen ${NO_VNC_PORT} &

echo "Desktop environment ready!"
echo "noVNC available at http://localhost:${NO_VNC_PORT}"

# Keep container running
wait
