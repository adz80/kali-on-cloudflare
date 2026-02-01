FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    zsh \
    curl \
    wget \
    net-tools \
    iputils-ping \
    dnsutils \
    nmap \
    ca-certificates \
    libwebsockets-dev \
    libjson-c-dev \
    build-essential \
    cmake \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/tsl0922/ttyd.git /tmp/ttyd && \
    cd /tmp/ttyd && \
    mkdir build && cd build && \
    cmake .. && \
    make && \
    make install && \
    rm -rf /tmp/ttyd

RUN useradd -m -s /bin/zsh kali && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY start.sh /start.sh
RUN chmod +x /start.sh

USER kali
WORKDIR /home/kali

ENV TERM=xterm-256color

EXPOSE 7681

CMD ["/start.sh"]
