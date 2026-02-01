FROM kalilinux/kali-rolling:latest

ENV DISPLAY=:1 \
    VNC_PORT=5901 \
    NO_VNC_PORT=6901 \
    VNC_COL_DEPTH=24 \
    VNC_RESOLUTION=1920x1080 \
    DEBIAN_FRONTEND=noninteractive \
    TERM=xterm

# Install desktop environment, VNC, and tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    xvfb xauth dbus-x11 xfce4 xfce4-terminal \
    kali-linux-default \
    wget sudo curl gpg git bzip2 vim procps python3 x11-xserver-utils \
    libnss3 libnspr4 libasound2t64 libgbm1 ca-certificates fonts-liberation xdg-utils \
    tigervnc-standalone-server tigervnc-common \
    zsh net-tools iputils-ping dnsutils nmap \
    firefox-esr && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install noVNC from git
RUN git clone --branch v1.6.0 --single-branch https://github.com/novnc/noVNC.git /opt/noVNC && \
    git clone --branch v0.13.0 --single-branch https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify && \
    ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html && \
    chmod +x /opt/noVNC/utils/novnc_proxy

# Disable shared memory X11
ENV QT_X11_NO_MITSHM=1 \
    _X11_NO_MITSHM=1 \
    _MITSHM=0

# Create kali user
RUN groupadd -g 61000 kali && \
    useradd -g 61000 -l -m -s /bin/zsh -u 61000 kali && \
    chmod 777 /root && \
    usermod -aG sudo kali && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create config directories
RUN mkdir -p /home/kali/.config/xfce4 && \
    chown -R kali:kali /home/kali && \
    chmod -R 777 /home/kali

# Copy entrypoint script
COPY entrypoint.sh /src/entrypoint.sh
RUN chmod +x /src/entrypoint.sh

USER kali
WORKDIR /home/kali

EXPOSE 6901

ENTRYPOINT ["/src/entrypoint.sh"]
