FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive

# Install desktop environment, VNC, and tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    xfce4 \
    xfce4-terminal \
    dbus-x11 \
    tigervnc-standalone-server \
    tigervnc-common \
    novnc \
    websockify \
    supervisor \
    zsh \
    curl \
    wget \
    net-tools \
    iputils-ping \
    dnsutils \
    nmap \
    ca-certificates \
    firefox-esr \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create kali user
RUN useradd -m -s /bin/zsh kali && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    echo "kali:kali" | chpasswd

# Set up VNC
RUN mkdir -p /home/kali/.vnc && \
    echo "kali" | vncpasswd -f > /home/kali/.vnc/passwd && \
    chmod 600 /home/kali/.vnc/passwd && \
    chown -R kali:kali /home/kali/.vnc

# VNC startup script
RUN echo '#!/bin/bash\n\
unset SESSION_MANAGER\n\
unset DBUS_SESSION_BUS_ADDRESS\n\
exec startxfce4' > /home/kali/.vnc/xstartup && \
    chmod +x /home/kali/.vnc/xstartup && \
    chown kali:kali /home/kali/.vnc/xstartup

# Supervisor config for running VNC and noVNC
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh

USER kali
WORKDIR /home/kali

ENV TERM=xterm-256color
ENV DISPLAY=:1

# noVNC WebSocket port
EXPOSE 6080

CMD ["/start.sh"]
