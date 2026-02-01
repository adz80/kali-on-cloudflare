#!/bin/bash

set -e

# Create VNC directory (no password needed with SecurityTypes None)
mkdir -p ~/.vnc

# Create xstartup script
cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4
EOF
chmod +x ~/.vnc/xstartup

# Kill any existing VNC sessions
vncserver -kill ${DISPLAY} 2>/dev/null || true

# Start VNC server (TigerVNC includes its own X server)
echo "Starting VNC server on display ${DISPLAY}..."
vncserver ${DISPLAY} \
    -geometry ${VNC_RESOLUTION} \
    -depth ${VNC_COL_DEPTH} \
    -SecurityTypes None \
    --I-KNOW-THIS-IS-INSECURE \
    -localhost no

sleep 3

# Start noVNC proxy - bind to 0.0.0.0 so it's accessible from outside container
echo "Starting noVNC on port ${NO_VNC_PORT}..."
/opt/noVNC/utils/novnc_proxy \
    --vnc localhost:${VNC_PORT} \
    --listen 0.0.0.0:${NO_VNC_PORT} \
    --web /opt/noVNC &

echo "Desktop environment ready!"
echo "noVNC available at http://0.0.0.0:${NO_VNC_PORT}"

# Keep container running
tail -f ~/.vnc/*:1.log
