FROM kalilinux/kali-rolling:latest

RUN apt-get update && apt-get install -y \
    ttyd \
    zsh \
    curl \
    wget \
    net-tools \
    iputils-ping \
    dnsutils \
    nmap \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/zsh kali && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY start.sh /start.sh
RUN chmod +x /start.sh

USER kali
WORKDIR /home/kali

ENV TERM=xterm-256color

EXPOSE 7681

CMD ["/start.sh"]
